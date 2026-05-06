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


BQ_PROJECT = os.environ.get("BQ_PROJECT", "minesweeper-495519")
BQ_DATASET = os.environ.get("BQ_DATASET", "fs_data_destination")
GAME_HOST = "web-game-nine-lake.vercel.app"


def _get_bq_client():
    """Initialize and return a BigQuery client from environment credentials."""
    creds_json = os.environ.get("BIGQUERY_CREDENTIALS")
    if not creds_json:
        return None

    creds_path = Path("/tmp/bq-credentials.json")
    creds_path.write_text(creds_json)
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(creds_path)

    from google.cloud import bigquery
    return bigquery.Client(project=BQ_PROJECT)


def _bq_table(name: str) -> str:
    return f"`{BQ_PROJECT}.{BQ_DATASET}.{name}`"


def pull_bigquery_data(week_start: str, week_end: str) -> list[dict]:
    """Pull session data from BigQuery for the given date range.

    Queries FullStory's Ready to Analyze Views schema, scoped to
    game sessions only (filters by game host, excludes wrapper).

    Returns a list of session-level dicts combining page view duration,
    click behavior, and fingerprint data.
    """
    client = _get_bq_client()
    if not client:
        logger.warning("BIGQUERY_CREDENTIALS not set — returning empty dataset")
        return []

    from google.cloud import bigquery

    # Session-level metrics from page_views, scoped to the game host.
    # Minesweeper is a single-page app so each page_view ≈ one play session.
    session_query = f"""
    SELECT
      pv.session_id,
      pv.user_id,
      pv.view_id,
      pv.event_time,
      pv.duration_millis,
      pv.active_duration_millis,
      pv.inactive_duration_millis,
      pv.max_scroll_depth,
      sp.url_host,
      sp.url_path,
      sp.url_query,
      sp.user_agent_browser,
      sp.user_agent_device,
      sp.user_agent_operating_system,
      sp.location_country,
      sp.location_region
    FROM {_bq_table('page_views')} pv
    LEFT JOIN {_bq_table('source_properties')} sp
      ON pv.event_id = sp.event_id
    WHERE pv.event_time BETWEEN @start AND @end
      AND sp.url_host = @game_host
    ORDER BY pv.event_time
    """

    # Click behavior per session — rage clicks, dead clicks, totals
    clicks_query = f"""
    SELECT
      c.session_id,
      COUNT(*) AS total_clicks,
      SUM(c.fs_rage_count) AS total_rage_clicks,
      SUM(c.fs_dead_count) AS total_dead_clicks
    FROM {_bq_table('clicks')} c
    LEFT JOIN {_bq_table('source_properties')} sp
      ON c.event_id = sp.event_id
    WHERE c.event_time BETWEEN @start AND @end
      AND sp.url_host = @game_host
    GROUP BY c.session_id
    """

    # Fingerprint custom events from the encoder
    fingerprint_query = f"""
    SELECT
      ce.session_id,
      ce.user_id,
      ce.event_name,
      ce.event_properties,
      ce.event_time
    FROM {_bq_table('custom_events')} ce
    LEFT JOIN {_bq_table('source_properties')} sp
      ON ce.event_id = sp.event_id
    WHERE ce.event_time BETWEEN @start AND @end
      AND sp.url_host = @game_host
    ORDER BY ce.event_time
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("start", "TIMESTAMP", week_start),
            bigquery.ScalarQueryParameter("end", "TIMESTAMP", week_end),
            bigquery.ScalarQueryParameter("game_host", "STRING", GAME_HOST),
        ]
    )

    logger.info("Querying page_views for game sessions...")
    sessions = [dict(row) for row in client.query(session_query, job_config=job_config)]
    logger.info("Found %d page view records", len(sessions))

    logger.info("Querying click behavior...")
    clicks = {
        row["session_id"]: dict(row)
        for row in client.query(clicks_query, job_config=job_config)
    }
    logger.info("Found click data for %d sessions", len(clicks))

    logger.info("Querying fingerprint custom events...")
    fingerprints_raw = [dict(row) for row in client.query(fingerprint_query, job_config=job_config)]
    logger.info("Found %d custom event records", len(fingerprints_raw))

    # Group fingerprints by session
    fingerprints_by_session: dict[str, list[dict]] = {}
    for fp in fingerprints_raw:
        sid = fp.get("session_id")
        if sid:
            fingerprints_by_session.setdefault(sid, []).append(fp)

    # Merge everything into session-level records
    enriched_sessions = []
    for session in sessions:
        sid = session.get("session_id")
        click_data = clicks.get(sid, {})
        session["total_clicks"] = click_data.get("total_clicks", 0)
        session["total_rage_clicks"] = click_data.get("total_rage_clicks", 0)
        session["total_dead_clicks"] = click_data.get("total_dead_clicks", 0)
        session["fingerprint_events"] = fingerprints_by_session.get(sid, [])
        enriched_sessions.append(session)

    logger.info("Assembled %d enriched session records", len(enriched_sessions))
    return enriched_sessions


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
