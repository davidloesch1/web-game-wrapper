"""Engineering agent — implements approved experiments via git branches."""

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


def merge_winner(winner: str, week: int, work_dir: str = "/tmp/game-merge") -> None:
    """Merge the winning variant branch into main.

    The losing branch is kept alive for historical reference —
    both variants remain playable via their Vercel preview URLs.

    Args:
        winner: "a" or "b"
        week: The week number of the completed experiment.
        work_dir: Temporary directory to clone into.
    """
    winning_branch = f"experiment/week-{week}-variant-{winner}"
    logger.info("Merging winner %s into main", winning_branch)

    if os.path.exists(work_dir):
        shutil.rmtree(work_dir)

    _run_git(["clone", GAME_REPO_URL, work_dir])
    _run_git(["checkout", "main"], cwd=work_dir)
    _run_git(
        ["merge", f"origin/{winning_branch}", "--no-ff",
         "-m", f"Week {week}: advance winning variant {winner.upper()} to main"],
        cwd=work_dir,
    )
    _run_git(["push", "origin", "main"], cwd=work_dir)

    logger.info("Main updated with week %d winner (variant %s)", week, winner.upper())


def run(proposal: dict, week: int, work_dir: str = "/tmp/game-experiment") -> dict:
    """Implement an approved experiment by creating variant branches.

    Creates two branches from main — variant A (control, identical to
    main) and variant B (treatment, with experiment changes applied).
    Both branches are kept permanently for historical reference.

    Args:
        proposal: Approved experiment proposal.
        week: Current week number.
        work_dir: Temporary directory to clone the game repo into.

    Returns:
        Dict with branch names and Vercel preview URLs.
    """
    branch_a = f"experiment/week-{week}-variant-a"
    branch_b = f"experiment/week-{week}-variant-b"

    if os.path.exists(work_dir):
        shutil.rmtree(work_dir)

    logger.info("Cloning game repo to %s", work_dir)
    _run_git(["clone", GAME_REPO_URL, work_dir])

    # Variant A — control branch (identical to main)
    logger.info("Creating control branch: %s", branch_a)
    _run_git(["checkout", "-b", branch_a], cwd=work_dir)
    _write_experiment_marker(work_dir, proposal, week, "a")
    _run_git(["add", "."], cwd=work_dir)
    _run_git(["commit", "-m", f"Week {week} experiment: variant A (control)"], cwd=work_dir)
    _run_git(["push", "-u", "origin", branch_a], cwd=work_dir)

    # Variant B — treatment branch
    logger.info("Creating treatment branch: %s", branch_b)
    _run_git(["checkout", "main"], cwd=work_dir)
    _run_git(["checkout", "-b", branch_b], cwd=work_dir)
    _write_experiment_marker(work_dir, proposal, week, "b")
    _run_git(["add", "."], cwd=work_dir)
    _run_git(["commit", "-m", f"Week {week} experiment: variant B (treatment)"], cwd=work_dir)
    _run_git(["push", "-u", "origin", branch_b], cwd=work_dir)

    # Get the commit SHAs so we can match them to Vercel deployments
    sha_a = _run_git(["rev-parse", "HEAD"], cwd=work_dir).strip()
    _run_git(["checkout", branch_a], cwd=work_dir)
    sha_a = _run_git(["rev-parse", "HEAD"], cwd=work_dir).strip()
    _run_git(["checkout", branch_b], cwd=work_dir)
    sha_b = _run_git(["rev-parse", "HEAD"], cwd=work_dir).strip()

    # Discover real Vercel preview URLs from GitHub deployments API
    variant_a_url = _discover_deployment_url(sha_a, branch_a)
    variant_b_url = _discover_deployment_url(sha_b, branch_b)

    logger.info("Variant A URL: %s", variant_a_url)
    logger.info("Variant B URL: %s", variant_b_url)

    return {
        "branch_a": branch_a,
        "branch_b": branch_b,
        "variant_a_url": variant_a_url,
        "variant_b_url": variant_b_url,
    }


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
