"""Weekly evolution pipeline orchestrator.

Pulls data, runs the AI agent team, and publishes the next experiment.
Designed to run as a GitHub Action on a weekly cron schedule.

Lifecycle per week:
  1. Pull session data from BigQuery
  2. Data Scientist analyzes the data
  3. Close previous experiment (determine winner from analysis)
  4. Merge winning variant into main (game production site updates)
  5. PM proposes next experiment, Ethics + Judge approve
  6. Engineering agent creates two new variant branches
  7. Update experiments.json and push (wrapper site updates)

All experiment branches are kept permanently as playable archives.
"""

import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("pipeline")

from agents.llm import configure as configure_llm
from agents import (
    analyze_data,
    propose_experiment,
    review_ethics,
    judge_experiment,
    implement_experiment,
    merge_winner,
)

REPO_ROOT = Path(__file__).parent.parent
EXPERIMENTS_JSON = REPO_ROOT / "public" / "data" / "experiments.json"
MAX_PROPOSAL_ATTEMPTS = 3


def load_experiments() -> dict:
    """Load the current experiments.json data."""
    with open(EXPERIMENTS_JSON) as f:
        return json.load(f)


def save_experiments(data: dict):
    """Write updated experiments.json."""
    with open(EXPERIMENTS_JSON, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def pull_bigquery_data(week_start: str, week_end: str) -> list[dict]:
    """Pull session data from BigQuery for the given date range.

    Returns a list of session dicts. If BigQuery credentials are not
    configured, returns an empty list (useful for dry-run testing).
    """
    creds_json = os.environ.get("BIGQUERY_CREDENTIALS")
    if not creds_json:
        logger.warning("BIGQUERY_CREDENTIALS not set — returning empty dataset")
        return []

    creds_path = Path("/tmp/bq-credentials.json")
    creds_path.write_text(creds_json)
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(creds_path)

    from google.cloud import bigquery

    client = bigquery.Client()
    query = """
    SELECT
      session_id,
      device_id,
      session_duration_seconds,
      page_url,
      custom_event_fingerprint_json,
      total_events,
      pages_visited
    FROM `your_project.fullstory.sessions`
    WHERE session_start BETWEEN @start AND @end
      AND page_url LIKE '%web-game-nine-lake%'
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("start", "STRING", week_start),
            bigquery.ScalarQueryParameter("end", "STRING", week_end),
        ]
    )
    results = client.query(query, job_config=job_config)
    return [dict(row) for row in results]


def get_running_experiment(experiment_data: dict) -> dict | None:
    """Find the currently running experiment, if any."""
    running = [e for e in experiment_data["experiments"] if e["status"] == "running"]
    return running[0] if running else None


def close_experiment(experiment_data: dict, analysis: dict) -> str | None:
    """Close the running experiment using the Data Scientist's analysis.

    Determines the winner from the analysis, updates metrics and status
    in experiment_data, and returns the winner ("a" or "b") or None if
    no experiment was running.
    """
    running = get_running_experiment(experiment_data)
    if not running:
        return None

    winner = None
    metrics_a = None
    metrics_b = None

    ab_comparison = analysis.get("ab_comparison")
    recommendations = analysis.get("recommendations", [])

    # Extract winner and metrics from the analysis
    # The Data Scientist's structured output should indicate a clear winner
    if isinstance(ab_comparison, dict):
        winner = ab_comparison.get("winner")
        metrics_a = ab_comparison.get("metric_a")
        metrics_b = ab_comparison.get("metric_b")
    elif isinstance(ab_comparison, str):
        ab_lower = ab_comparison.lower()
        if "variant b" in ab_lower and ("win" in ab_lower or "better" in ab_lower or "higher" in ab_lower):
            winner = "b"
        elif "variant a" in ab_lower and ("win" in ab_lower or "better" in ab_lower or "higher" in ab_lower):
            winner = "a"

    # Default to "a" (keep current) if no clear winner
    if winner not in ("a", "b"):
        logger.warning("No clear winner detected — defaulting to variant A (keep current)")
        winner = "a"

    # Update the experiment record
    for exp in experiment_data["experiments"]:
        if exp["week"] == running["week"] and exp["status"] == "running":
            exp["status"] = "complete"
            exp["winner"] = winner
            if metrics_a is not None:
                exp["metrics"]["a"] = metrics_a
            if metrics_b is not None:
                exp["metrics"]["b"] = metrics_b
            # Set versionUrl to the winning variant's URL
            exp["versionUrl"] = exp["variantAUrl"] if winner == "a" else exp["variantBUrl"]
            logger.info(
                "Week %d complete: variant %s wins (A=%.1f, B=%.1f)",
                exp["week"],
                winner.upper(),
                metrics_a or 0,
                metrics_b or 0,
            )
            break

    return winner


def publish_new_experiment(
    experiment_data: dict,
    proposal: dict,
    deployment: dict,
    week: int,
):
    """Add the new experiment to experiments.json."""
    today = datetime.utcnow().date()
    start_date = today.isoformat()
    end_date = (today + timedelta(days=6)).isoformat()

    new_experiment = {
        "week": week,
        "status": "running",
        "hypothesis": proposal.get("hypothesis", ""),
        "variantA": proposal.get("variant_a_description", ""),
        "variantB": proposal.get("variant_b_description", ""),
        "variantAUrl": deployment.get("variant_a_url", ""),
        "variantBUrl": deployment.get("variant_b_url", ""),
        "startDate": start_date,
        "endDate": end_date,
        "metrics": {"a": None, "b": None},
        "winner": None,
        "changelog": proposal.get("hypothesis", ""),
        "versionUrl": None,
    }

    experiment_data["currentWeek"] = week
    experiment_data["experiments"].append(new_experiment)

    save_experiments(experiment_data)
    logger.info("Published week %d experiment to experiments.json", week)


def git_commit_and_push(message: str):
    """Commit and push the updated experiments.json."""
    subprocess.run(
        ["git", "add", str(EXPERIMENTS_JSON)],
        cwd=REPO_ROOT, check=True,
    )
    subprocess.run(
        ["git", "commit", "-m", message],
        cwd=REPO_ROOT, check=True,
    )
    subprocess.run(
        ["git", "push"],
        cwd=REPO_ROOT, check=True,
    )
    logger.info("Pushed experiments.json update to remote")


def run_pipeline():
    """Execute the full weekly evolution pipeline."""
    logger.info("=" * 60)
    logger.info("WEEKLY EVOLUTION PIPELINE")
    logger.info("=" * 60)

    # --- Setup ---
    configure_llm()
    experiment_data = load_experiments()
    current_week = experiment_data["currentWeek"]
    next_week = current_week + 1
    goal = experiment_data["goal"]
    experiment_history = experiment_data["experiments"]

    logger.info("Current week: %d → Running pipeline for week %d", current_week, next_week)

    # --- Stage 1: Pull data ---
    logger.info("--- Stage 1: Pull BigQuery data ---")
    running_experiment = get_running_experiment(experiment_data)
    if running_experiment:
        session_data = pull_bigquery_data(
            running_experiment["startDate"],
            running_experiment["endDate"],
        )
        logger.info("Pulled %d sessions from BigQuery", len(session_data))
    else:
        session_data = []
        logger.info("No previous experiment — using empty dataset for baseline")

    # --- Stage 2: Data Scientist analysis ---
    logger.info("--- Stage 2: Data Scientist analysis ---")
    analysis = analyze_data(session_data, experiment_history)
    logger.info("Analysis summary: %s", analysis.get("summary", "N/A"))

    # --- Stage 3: Close previous experiment and merge winner ---
    logger.info("--- Stage 3: Close previous experiment ---")
    if running_experiment:
        winner = close_experiment(experiment_data, analysis)
        if winner:
            logger.info("Winner: variant %s — merging to main", winner.upper())
            merge_winner(winner, current_week)
        else:
            logger.info("No winner determined — keeping current main")
    else:
        logger.info("No previous experiment to close (baseline week)")

    # --- Stage 4: PM proposal + Ethics/Judge approval loop ---
    logger.info("--- Stage 4: Proposal and approval loop ---")
    feedback = None
    approved_proposal = None

    for attempt in range(1, MAX_PROPOSAL_ATTEMPTS + 1):
        logger.info("Proposal attempt %d/%d", attempt, MAX_PROPOSAL_ATTEMPTS)

        proposal = propose_experiment(analysis, experiment_history, goal, feedback)
        logger.info("Hypothesis: %s", proposal.get("hypothesis", "N/A"))

        ethics = review_ethics(proposal)
        if not ethics.get("approved", False):
            concerns = ethics.get("concerns", [])
            logger.warning("Ethics REJECTED: %s", concerns)
            feedback = f"Ethics rejection: {'; '.join(concerns)}"
            continue

        logger.info("Ethics APPROVED")

        judgment = judge_experiment(proposal, experiment_history)
        score = judgment.get("score", 0)
        logger.info("Judge score: %d/100", score)

        if judgment.get("approved", False):
            logger.info("Judge APPROVED (score: %d)", score)
            approved_proposal = proposal
            break
        else:
            feedback = judgment.get("feedback", "Experiment not aligned with goal")
            logger.warning("Judge REJECTED (score: %d): %s", score, feedback)

    if not approved_proposal:
        logger.error(
            "All %d proposal attempts rejected — skipping this week",
            MAX_PROPOSAL_ATTEMPTS,
        )
        # Still save the closed experiment results even if no new experiment launches
        save_experiments(experiment_data)
        git_commit_and_push(f"Week {current_week}: close experiment (no new experiment this week)")
        sys.exit(0)

    # --- Stage 5: Engineering implementation ---
    logger.info("--- Stage 5: Engineering implementation ---")
    deployment = implement_experiment(approved_proposal, next_week)
    logger.info(
        "Deployed: A=%s, B=%s",
        deployment.get("variant_a_url"),
        deployment.get("variant_b_url"),
    )

    # --- Stage 6: Publish ---
    logger.info("--- Stage 6: Publish new experiment ---")
    publish_new_experiment(experiment_data, approved_proposal, deployment, next_week)
    git_commit_and_push(
        f"Week {next_week}: launch new experiment — {approved_proposal.get('hypothesis', '')[:60]}"
    )

    logger.info("=" * 60)
    logger.info("Pipeline complete — week %d experiment is live", next_week)
    logger.info("=" * 60)


if __name__ == "__main__":
    run_pipeline()
