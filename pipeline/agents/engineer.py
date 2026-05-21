"""Engineering agent — implements approved experiments via git branches.

Strategy: main is always Variant A (the control).  Each week the engineer
creates a single challenger branch (variant B).  When a winner is decided:
  - B wins → merge B into main, tag the pre-merge state, bump experiment.json
  - A wins → main stays, just bump experiment.json for the next week

This keeps every variant-B branch alive as a permanent, playable archive
via its Vercel preview URL.
"""

import difflib
import json
import logging
import os
import shutil
import subprocess
import time
import urllib.request

from .llm import call_gemini, load_prompt

logger = logging.getLogger(__name__)

ALLOWED_FILES = {"game.js", "style.css", "index.html"}
MAX_LINES_CHANGED = 50

GAME_REPO_URL = os.environ.get(
    "GAME_REPO_URL",
    "https://github.com/davidloesch1/web-game.git",
)

MAIN_PRODUCTION_URL = "https://web-game-nine-lake.vercel.app/"


def merge_winner(winner: str, week: int, next_week: int, work_dir: str = "/tmp/game-merge") -> None:
    """Close the current experiment and prepare main for the next week.

    If B won, merge the experiment branch into main.
    Either way, update experiment.json on main so every session played
    on the production site is tagged as variant A for the upcoming week.

    The losing/old branch is kept permanently for historical reference.
    """
    if os.path.exists(work_dir):
        shutil.rmtree(work_dir)

    _run_git(["clone", GAME_REPO_URL, work_dir])
    _run_git(["checkout", "main"], cwd=work_dir)

    # Tag the current main so we have a playable snapshot of this week's control
    tag_name = f"week-{week}-control"
    try:
        _run_git(["tag", tag_name], cwd=work_dir)
        _run_git(["push", "origin", tag_name], cwd=work_dir)
        logger.info("Tagged main as %s", tag_name)
    except RuntimeError:
        logger.warning("Tag %s already exists — skipping", tag_name)

    if winner == "b":
        winning_branch = f"experiment/week-{week}-variant-b"
        logger.info("Merging winner %s into main", winning_branch)
        _run_git(
            ["merge", f"origin/{winning_branch}", "--no-ff",
             "-m", f"Week {week}: advance winning variant B to main"],
            cwd=work_dir,
        )

    # Update experiment.json on main for the next week (variant A / control)
    _update_main_experiment_marker(work_dir, next_week)
    _run_git(["add", "experiment.json"], cwd=work_dir)
    _run_git(
        ["commit", "--allow-empty", "-m",
         f"Week {next_week}: set experiment.json for variant A (control)"],
        cwd=work_dir,
    )
    _run_git(["push", "origin", "main"], cwd=work_dir)

    logger.info(
        "Main updated — week %d winner: %s, experiment.json set for week %d",
        week, winner.upper(), next_week,
    )


def _generate_code_changes(proposal: dict, work_dir: str) -> dict[str, str]:
    """Use Gemini to generate modified file contents based on the PM's notes.

    Reads the current contents of each file the PM specified, sends them
    to Gemini along with the implementation notes, and returns a dict
    mapping filename to new file contents.
    """
    files_to_change = proposal.get("files_changed", [])
    if not files_to_change:
        logger.warning("No files_changed in proposal — skipping code generation")
        return {}

    disallowed = [f for f in files_to_change if f not in ALLOWED_FILES]
    if disallowed:
        raise ValueError(f"Proposal targets disallowed files: {disallowed}")

    current_contents = {}
    for filename in files_to_change:
        filepath = os.path.join(work_dir, filename)
        if os.path.exists(filepath):
            with open(filepath) as f:
                current_contents[filename] = f.read()
        else:
            logger.warning("File %s not found in repo — will be created", filename)
            current_contents[filename] = ""

    system_prompt = load_prompt("engineer")
    user_payload = json.dumps({
        "implementation_notes": proposal.get("implementation_notes", ""),
        "hypothesis": proposal.get("hypothesis", ""),
        "variant_b_description": proposal.get("variant_b_description", ""),
        "current_files": current_contents,
    }, indent=2)

    logger.info("Calling Gemini to generate code changes for: %s", files_to_change)
    result = call_gemini(system_prompt, user_payload)

    if not isinstance(result, dict):
        raise ValueError(f"Gemini returned unexpected type: {type(result).__name__}")

    unknown_files = [f for f in result if f not in ALLOWED_FILES]
    if unknown_files:
        raise ValueError(f"Gemini produced changes to disallowed files: {unknown_files}")

    return result


def _validate_changes(
    original_contents: dict[str, str],
    new_contents: dict[str, str],
) -> int:
    """Validate the generated changes against scope limits.

    Returns the total number of lines changed. Raises ValueError if
    validation fails.
    """
    total_changed = 0

    for filename, new_text in new_contents.items():
        old_text = original_contents.get(filename, "")
        old_lines = old_text.splitlines(keepends=True)
        new_lines = new_text.splitlines(keepends=True)

        diff = list(difflib.unified_diff(
            old_lines, new_lines, fromfile=filename, tofile=filename,
        ))
        changed = sum(
            1 for line in diff
            if line.startswith("+") or line.startswith("-")
        )
        changed = max(0, changed - 2)  # subtract --- and +++ headers

        logger.info("  %s: %d lines changed", filename, changed)
        total_changed += changed

    if total_changed > MAX_LINES_CHANGED:
        raise ValueError(
            f"Total lines changed ({total_changed}) exceeds limit "
            f"({MAX_LINES_CHANGED}). Aborting to stay within constraints."
        )

    if total_changed == 0:
        logger.warning("Gemini returned identical file contents — no changes applied")

    return total_changed


def _apply_changes(work_dir: str, new_contents: dict[str, str]):
    """Write the generated file contents to the working tree."""
    for filename, contents in new_contents.items():
        filepath = os.path.join(work_dir, filename)
        with open(filepath, "w") as f:
            f.write(contents)
        logger.info("  Wrote %s (%d bytes)", filename, len(contents))


def run(proposal: dict, week: int, work_dir: str = "/tmp/game-experiment") -> dict:
    """Implement an experiment by creating the variant-B challenger branch.

    Main is always variant A (control).  This function creates a single
    branch from main with the experimental changes applied, plus the
    experiment.json marker identifying it as variant B.

    Flow:
    1. Clone repo, create branch
    2. Call Gemini with PM implementation notes + current file contents
    3. Validate the generated changes (file count, line count)
    4. Apply changes, write experiment marker, commit, push
    5. Discover the Vercel preview URL

    Args:
        proposal: Approved experiment proposal.
        week: Current week number.
        work_dir: Temporary directory to clone the game repo into.

    Returns:
        Dict with branch name and Vercel preview URLs.
    """
    branch_b = f"experiment/week-{week}-variant-b"

    if os.path.exists(work_dir):
        shutil.rmtree(work_dir)

    logger.info("Cloning game repo to %s", work_dir)
    _run_git(["clone", GAME_REPO_URL, work_dir])

    logger.info("Creating treatment branch: %s", branch_b)
    _run_git(["checkout", "-b", branch_b], cwd=work_dir)

    files_to_change = proposal.get("files_changed", [])
    original_contents = {}
    for filename in files_to_change:
        filepath = os.path.join(work_dir, filename)
        if os.path.exists(filepath):
            with open(filepath) as f:
                original_contents[filename] = f.read()

    if files_to_change:
        new_contents = _generate_code_changes(proposal, work_dir)
        if new_contents:
            lines_changed = _validate_changes(original_contents, new_contents)
            _apply_changes(work_dir, new_contents)
            logger.info(
                "Applied %d lines of changes across %d file(s)",
                lines_changed, len(new_contents),
            )
        else:
            logger.warning(
                "No code changes generated — branch will only have experiment marker"
            )
    else:
        logger.warning(
            "No files_changed in proposal — branch will only have experiment marker"
        )

    _write_experiment_marker(work_dir, proposal, week, "b")
    _run_git(["add", "."], cwd=work_dir)
    _run_git(
        ["commit", "-m", f"Week {week} experiment: variant B (treatment)"],
        cwd=work_dir,
    )
    _run_git(["push", "-u", "origin", branch_b], cwd=work_dir)

    sha_b = _run_git(["rev-parse", "HEAD"], cwd=work_dir).strip()
    variant_b_url = _discover_deployment_url(sha_b, branch_b)

    logger.info("Variant A URL (main): %s", MAIN_PRODUCTION_URL)
    logger.info("Variant B URL: %s", variant_b_url)

    return {
        "branch_b": branch_b,
        "variant_a_url": MAIN_PRODUCTION_URL,
        "variant_b_url": variant_b_url,
    }


def _update_main_experiment_marker(work_dir: str, week: int):
    """Write experiment.json on main identifying it as the control for a given week."""
    marker_path = os.path.join(work_dir, "experiment.json")
    with open(marker_path, "w") as f:
        json.dump({
            "week": week,
            "variant": "a",
            "hypothesis": "",
            "description": "Control — current production game",
            "implementation_notes": "",
        }, f, indent=2)
        f.write("\n")


def _discover_deployment_url(
    commit_sha: str,
    branch: str,
    repo: str = "davidloesch1/web-game",
    max_wait: int = 60,
    poll_interval: int = 10,
) -> str:
    """Poll GitHub's deployments API to find the Vercel preview URL for a commit."""
    token = os.environ.get("GAME_REPO_PAT") or os.environ.get("GITHUB_TOKEN", "")
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "evolution-pipeline",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if not token:
        repo_url = os.environ.get("GAME_REPO_URL", "")
        if "x-access-token:" in repo_url:
            token = repo_url.split("x-access-token:")[1].split("@")[0]
            headers["Authorization"] = f"Bearer {token}"

    deployments_url = f"https://api.github.com/repos/{repo}/deployments?sha={commit_sha}&per_page=5"

    waited = 0
    while waited < max_wait:
        try:
            req = urllib.request.Request(deployments_url, headers=headers)
            with urllib.request.urlopen(req) as resp:
                deployments = json.loads(resp.read())

            for dep in deployments:
                statuses_url = dep.get("statuses_url", "")
                if not statuses_url:
                    continue
                req2 = urllib.request.Request(statuses_url, headers=headers)
                with urllib.request.urlopen(req2) as resp2:
                    statuses = json.loads(resp2.read())
                for status in statuses:
                    if status.get("state") == "success" and status.get("target_url"):
                        return status["target_url"]
        except Exception as e:
            logger.warning("Deployment API poll failed: %s", e)

        if waited < max_wait:
            logger.info("Waiting for Vercel deployment of %s... (%ds)", branch, waited)
            time.sleep(poll_interval)
            waited += poll_interval

    fallback = f"https://web-game-git-{branch.replace('/', '-')}-davidloesch1.vercel.app"
    logger.warning("Could not discover deployment URL for %s — using fallback: %s", branch, fallback)
    return fallback


def _write_experiment_marker(work_dir: str, proposal: dict, week: int, variant: str):
    """Write an experiment config marker file to the game repo."""
    marker_path = os.path.join(work_dir, "experiment.json")
    with open(marker_path, "w") as f:
        json.dump({
            "week": week,
            "variant": variant,
            "hypothesis": proposal.get("hypothesis", ""),
            "description": proposal.get(
                f"variant_{'a' if variant == 'a' else 'b'}_description", ""
            ),
            "implementation_notes": proposal.get("implementation_notes", ""),
        }, f, indent=2)


def _run_git(args: list[str], cwd: str | None = None):
    """Run a git command and raise on failure."""
    result = subprocess.run(
        ["git"] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        logger.error("git %s failed: %s", " ".join(args), result.stderr)
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr}")
    return result.stdout
