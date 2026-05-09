"""Engineering agent — implements approved experiments via git branches.

Strategy: main is always the control.  Each experiment the engineer
creates a single challenger branch.  When a winner is decided:
  - Challenger wins → merge into main, tag the pre-merge state, bump version
  - Control wins → main stays, just bump the version marker

This keeps every challenger branch alive as a permanent, playable archive
via its deploy preview URL.
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

MAIN_PRODUCTION_URL = os.environ.get(
    "MAIN_PRODUCTION_URL",
    "https://web-game-nine-lake.vercel.app/",
)


def _get_repo_url(site_config: dict | None = None) -> str:
    """Get the git repo URL, preferring site config over env."""
    if site_config and site_config.get("repo"):
        repo = site_config["repo"]
        token = os.environ.get("GAME_REPO_PAT", "")
        if token:
            return f"https://x-access-token:{token}@github.com/{repo}.git"
        return f"https://github.com/{repo}.git"
    return GAME_REPO_URL


def _get_production_url(site_config: dict | None = None) -> str:
    if site_config and site_config.get("production_url"):
        url = site_config["production_url"]
        return url if url.startswith("https://") else f"https://{url}/"
    return MAIN_PRODUCTION_URL


def merge_winner(winner: str, week: int, next_week: int, work_dir: str = "/tmp/game-merge", site_config: dict | None = None) -> None:
    """Close the current experiment and prepare main for the next week.

    If B won, merge the experiment branch into main.
    Either way, update experiment.json on main so every session played
    on the production site is tagged as variant A for the upcoming week.

    The losing/old branch is kept permanently for historical reference.
    """
    repo_url = _get_repo_url(site_config)
    site_id = (site_config or {}).get("site_id", "site")

    if os.path.exists(work_dir):
        shutil.rmtree(work_dir)

    _run_git(["clone", repo_url, work_dir])
    _run_git(["checkout", "main"], cwd=work_dir)

    tag_name = f"{site_id}-week-{week}-control"
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
             "-m", f"{site_id} week {week}: advance winning challenger to main"],
            cwd=work_dir,
        )

    _update_main_experiment_marker(work_dir, next_week, site_config)
    _run_git(["add", "experiment.json"], cwd=work_dir)
    _run_git(
        ["commit", "--allow-empty", "-m",
         f"{site_id}: set experiment.json for control (week {next_week})"],
        cwd=work_dir,
    )
    _run_git(["push", "origin", "main"], cwd=work_dir)

    logger.info(
        "Main updated — %s week %d winner: %s",
        site_id, week, winner.upper(),
    )


def run(proposal: dict, week: int, work_dir: str = "/tmp/game-experiment", site_config: dict | None = None) -> dict:
    """Implement an experiment by creating a challenger branch.

    Main is always the control. This function creates a single branch
    from main with the experimental changes applied, plus the
    experiment.json marker identifying it as the challenger.

    Args:
        proposal: Approved experiment proposal.
        week: Current week/cycle number.
        work_dir: Temporary directory to clone the repo into.
        site_config: Parsed site config dict.

    Returns:
        Dict with branch name and deploy URLs.
    """
    repo_url = _get_repo_url(site_config)
    production_url = _get_production_url(site_config)
    site_id = (site_config or {}).get("site_id", "site")
    repo_slug = (site_config or {}).get("repo", "davidloesch1/web-game")
    branch_b = f"experiment/week-{week}-variant-b"

    if os.path.exists(work_dir):
        shutil.rmtree(work_dir)

    logger.info("Cloning %s to %s", repo_slug, work_dir)
    _run_git(["clone", repo_url, work_dir])

    logger.info("Creating challenger branch: %s", branch_b)
    _run_git(["checkout", "-b", branch_b], cwd=work_dir)
    _write_experiment_marker(work_dir, proposal, week, "challenger", site_config)
    _run_git(["add", "."], cwd=work_dir)
    _run_git(["commit", "-m", f"{site_id} experiment: challenger (week {week})"], cwd=work_dir)
    _run_git(["push", "-u", "origin", branch_b], cwd=work_dir)

    sha_b = _run_git(["rev-parse", "HEAD"], cwd=work_dir).strip()
    variant_b_url = _discover_deployment_url(sha_b, branch_b, repo=repo_slug)

    logger.info("Control URL (main): %s", production_url)
    logger.info("Challenger URL: %s", variant_b_url)

    return {
        "branch_b": branch_b,
        "variant_a_url": production_url,
        "variant_b_url": variant_b_url,
    }


def _update_main_experiment_marker(work_dir: str, week: int, site_config: dict | None = None):
    """Write experiment.json on main identifying it as the control."""
    site_id = (site_config or {}).get("site_id", "site")
    version = (site_config or {}).get("site_version", "1.0.0")
    marker_path = os.path.join(work_dir, "experiment.json")
    with open(marker_path, "w") as f:
        json.dump({
            "site_id": site_id,
            "experiment_id": f"{site_id}-v{version}",
            "experiment_variant": "control",
            "site_version": version,
            "week": week,
            "hypothesis": "",
            "description": "Control — current production site",
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
    """Poll GitHub's deployments API to find the Vercel preview URL for a commit.

    Vercel creates a GitHub deployment when it deploys a branch. We poll
    until the deployment appears and has a success status with a target_url.

    Falls back to a constructed URL if the API doesn't return one in time.
    """
    token = os.environ.get("GAME_REPO_PAT") or os.environ.get("GITHUB_TOKEN", "")
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "evolution-pipeline",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    # Extract token from GAME_REPO_URL if not set separately
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

    # Fallback: construct a URL (may not work but is better than nothing)
    fallback = f"https://web-game-git-{branch.replace('/', '-')}-davidloesch1.vercel.app"
    logger.warning("Could not discover deployment URL for %s — using fallback: %s", branch, fallback)
    return fallback


def _write_experiment_marker(work_dir: str, proposal: dict, week: int, variant: str, site_config: dict | None = None):
    """Write an experiment config marker file to the site repo."""
    site_id = (site_config or {}).get("site_id", "site")
    version = (site_config or {}).get("site_version", "1.0.0")
    marker_path = os.path.join(work_dir, "experiment.json")
    with open(marker_path, "w") as f:
        json.dump({
            "site_id": site_id,
            "experiment_id": f"{site_id}-v{version}",
            "experiment_variant": variant,
            "site_version": version,
            "week": week,
            "hypothesis": proposal.get("hypothesis", ""),
            "description": proposal.get("challenger_description", "") or proposal.get("variant_b_description", ""),
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
