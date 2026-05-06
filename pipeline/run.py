"""Weekly evolution pipeline orchestrator.

Pulls data, runs the AI agent team, and publishes the next experiment.
Designed to run as a GitHub Action on a weekly cron schedule.
"""

import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Configure logging before any imports that use it
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
)

REPO_ROOT = Path(__file__).parent.parent
EXPERIMENTS_JSON = REPO_ROOT / "public" / "data" / "experiments.json"
SOURCE_OF_TRUTH = Path(__file__).parent / "source_of_truth.md"
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

    # Write credentials to a temp file for the BQ client
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


def determine_previous_winner(experiment_data: dict) -> dict | None:
    """Determine the winner of the most recently completed experiment."""
    running = [e for e in experiment_data["experiments"] if e["status"] == "running"]
    if not running:
        return None
    return running[0]


def publish_results(
    experiment_data: dict,
    previous_experiment: dict | None,
    proposal: dict,
    deployment: dict,
    week: int,
):
    """Update experiments.json with completed results and the new experiment."""
    # Close out the previous experiment if one was running
    if previous_experiment:
        for exp in experiment_data["experiments"]:
            if exp["week"] == previous_experiment["week"] and exp["status"] == "running":
                exp["status"] = "complete"
                # Metrics and winner would come from BigQuery analysis
                # For now, the Data Scientist's ab_comparison informs this
                logger.info("Marked week %d experiment as complete", exp["week"])

    # Calculate date range for the new experiment
    today = datetime.utcnow().date()
    start_date = today.isoformat()
    end_date = (today + timedelta(days=6)).isoformat()

    # Add the new experiment
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
        "versionUrl": deployment.get("variant_a_url"),
    }

    experiment_data["currentWeek"] = week
    experiment_data["experiments"].append(new_experiment)

    save_experiments(experiment_data)
    logger.info("Published week %d experiment to experiments.json", week)


def git_commit_and_push(week: int):
    """Commit and push the updated experiments.json."""
    subprocess.run(
        ["git", "add", str(EXPERIMENTS_JSON)],
        cwd=REPO_ROOT,
        check=True,
    )
    subprocess.run(
        ["git", "commit", "-m", f"Week {week}: publish new experiment"],
        cwd=REPO_ROOT,
        check=True,
    )
    subprocess.run(
        ["git", "push"],
        cwd=REPO_ROOT,
        check=True,
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
    previous_experiment = determine_previous_winner(experiment_data)
    if previous_experiment:
        session_data = pull_bigquery_data(
            previous_experiment["startDate"],
            previous_experiment["endDate"],
        )
        logger.info("Pulled %d sessions from BigQuery", len(session_data))
    else:
        session_data = []
        logger.info("No previous experiment — using empty dataset for baseline")

    # --- Stage 2: Data Scientist analysis ---
    logger.info("--- Stage 2: Data Scientist analysis ---")
    analysis = analyze_data(session_data, experiment_history)
    logger.info("Analysis summary: %s", analysis.get("summary", "N/A"))

    # --- Stage 3-4: PM proposal + Ethics/Judge approval loop ---
    logger.info("--- Stage 3-4: Proposal and approval loop ---")
    feedback = None
    approved_proposal = None

    for attempt in range(1, MAX_PROPOSAL_ATTEMPTS + 1):
        logger.info("Proposal attempt %d/%d", attempt, MAX_PROPOSAL_ATTEMPTS)

        # PM proposes
        proposal = propose_experiment(analysis, experiment_history, goal, feedback)
        logger.info("Hypothesis: %s", proposal.get("hypothesis", "N/A"))

        # Ethics review
        ethics = review_ethics(proposal)
        if not ethics.get("approved", False):
            concerns = ethics.get("concerns", [])
            logger.warning("Ethics REJECTED: %s", concerns)
            feedback = f"Ethics rejection: {'; '.join(concerns)}"
            continue

        logger.info("Ethics APPROVED")

        # Judge review
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
            continue

    if not approved_proposal:
        logger.error("All %d proposal attempts rejected — skipping this week", MAX_PROPOSAL_ATTEMPTS)
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
    logger.info("--- Stage 6: Publish results ---")
    publish_results(experiment_data, previous_experiment, approved_proposal, deployment, next_week)
    git_commit_and_push(next_week)

    logger.info("=" * 60)
    logger.info("Pipeline complete for week %d", next_week)
    logger.info("=" * 60)


if __name__ == "__main__":
    run_pipeline()
