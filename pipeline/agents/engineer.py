"""Engineering agent — implements approved experiments via Cursor SDK or git."""

import json
import logging
import os
import subprocess

logger = logging.getLogger(__name__)

GAME_REPO_URL = os.environ.get(
    "GAME_REPO_URL",
    "https://github.com/davidloesch1/web-game.git",
)


def run(proposal: dict, week: int, work_dir: str = "/tmp/game-experiment") -> dict:
    """Implement an approved experiment by creating variant branches.

    For now this creates the branch structure and writes the experiment
    spec as a config file. Full Cursor SDK integration can be added
    once the game repo supports parameterized configuration.

    Args:
        proposal: Approved experiment proposal.
        week: Current week number.
        work_dir: Temporary directory to clone the game repo into.

    Returns:
        Dict with variant_a_url and variant_b_url (Vercel preview URLs).
    """
    branch_a = f"experiment/week-{week}-variant-a"
    branch_b = f"experiment/week-{week}-variant-b"

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

    # Vercel auto-deploys branches — construct preview URLs
    # These follow Vercel's pattern: <project>-git-<branch>-<user>.vercel.app
    # The actual URLs will need to be confirmed from Vercel's API
    variant_a_url = os.environ.get(
        "VARIANT_A_URL_OVERRIDE",
        f"https://web-game-git-{branch_a.replace('/', '-')}-davidloesch1.vercel.app",
    )
    variant_b_url = os.environ.get(
        "VARIANT_B_URL_OVERRIDE",
        f"https://web-game-git-{branch_b.replace('/', '-')}-davidloesch1.vercel.app",
    )

    logger.info("Variant A URL: %s", variant_a_url)
    logger.info("Variant B URL: %s", variant_b_url)

    return {
        "branch_a": branch_a,
        "branch_b": branch_b,
        "variant_a_url": variant_a_url,
        "variant_b_url": variant_b_url,
    }


def _write_experiment_marker(work_dir: str, proposal: dict, week: int, variant: str):
    """Write an experiment config marker file to the game repo."""
    import os as _os
    marker_path = _os.path.join(work_dir, "experiment.json")
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
