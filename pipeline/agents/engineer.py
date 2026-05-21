"""Engineering agent — implements approved experiments via git branches.

Strategy: main is always Variant A (the control).  Each week the engineer
creates a single challenger branch (variant B).  When a winner is decided:
  - B wins → merge B into main, tag the pre-merge state, bump experiment.json
  - A wins → main stays, just bump experiment.json for the next week

This keeps every variant-B branch alive as a permanent, playable archive
via its Vercel preview URL.
"""

import json
import logging
import os
import shutil
import subprocess
import time
import urllib.request

logger = logging.getLogger(__name__)

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


def run(proposal: dict, week: int, work_dir: str = "/tmp/game-experiment") -> dict:
    """Implement an experiment by creating the variant-B challenger branch.

    Main is always variant A (control).  This function creates a single
    branch from main with the experimental changes applied, plus the
    experiment.json marker identifying it as variant B.

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

    # Create variant B — the challenger branch
    logger.info("Creating treatment branch: %s", branch_b)
    _run_git(["checkout", "-b", branch_b], cwd=work_dir)
    _write_experiment_marker(work_dir, proposal, week, "b")
    _run_git(["add", "."], cwd=work_dir)
    _run_git(["commit", "-m", f"Week {week} experiment: variant B (treatment)"], cwd=work_dir)
    _run_git(["push", "-u", "origin", branch_b], cwd=work_dir)

    # Discover Vercel preview URL for variant B
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
