"""Weekly evolution pipeline orchestrator.

Pulls data, runs the AI agent team, and publishes the next experiment.
Designed to run as a GitHub Action on a weekly cron schedule.

Lifecycle per week:
  1.  Pull session data from BigQuery (quantitative)
  1b. Generate AI session summaries via FullStory (qualitative)
  2.  Data Scientist analyzes both quantitative + qualitative data
  3.  Close previous experiment (determine winner from analysis)
  4.  Merge winner into main if B won; tag + bump experiment.json either way
  5.  PM proposes next experiment, Ethics + Judge approve
  6.  Engineering agent creates variant-B challenger branch
  7.  Update experiments.json and push (wrapper site updates)

Main is always variant A (control).  Variant-B branches are kept
permanently as playable archives via Vercel preview URLs.
"""

import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
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
from agents.session_summarizer import (
    run as summarize_sessions,
    aggregate_summaries,
)

REPO_ROOT = Path(__file__).parent.parent
PIPELINE_DIR = Path(__file__).parent
EXPERIMENTS_JSON = REPO_ROOT / "public" / "data" / "experiments.json"
EXCEPTION_REQUESTS_JSON = PIPELINE_DIR / "exception_requests.json"
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


def pull_bigquery_data(week_start: str, week_end: str, experiment_week: int | None = None) -> list[dict]:
    """Pull session data from BigQuery for the given date range.

    Queries FullStory's Ready to Analyze Views schema. Uses the
    page_properties table to identify game sessions by experiment_week
    and experiment_variant (set by the game via experiment.json).

    For baseline weeks (no experiment running), falls back to filtering
    by the game's production host.

    Returns a list of session-level dicts combining page view duration,
    click behavior, fingerprint data, and experiment variant assignment.
    """
    client = _get_bq_client()
    if not client:
        logger.warning("BIGQUERY_CREDENTIALS not set — returning empty dataset")
        return []

    from google.cloud import bigquery

    # When an experiment was running, use page_properties to identify
    # game sessions and their variant assignment. This works regardless
    # of which Vercel preview URL the game was deployed to.
    if experiment_week is not None:
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
          pp.experiment_week,
          pp.experiment_variant,
          sp.url_host,
          sp.user_agent_browser,
          sp.user_agent_device,
          sp.user_agent_operating_system,
          sp.location_country,
          sp.location_region
        FROM {_bq_table('page_views')} pv
        INNER JOIN {_bq_table('page_properties')} pp
          ON pv.event_id = pp.event_id
        LEFT JOIN {_bq_table('source_properties')} sp
          ON pv.event_id = sp.event_id
        WHERE pv.event_time BETWEEN @start AND @end
          AND pp.experiment_week = @experiment_week
        ORDER BY pv.event_time
        """

        clicks_query = f"""
        SELECT
          c.session_id,
          COUNT(*) AS total_clicks,
          SUM(c.fs_rage_count) AS total_rage_clicks,
          SUM(c.fs_dead_count) AS total_dead_clicks
        FROM {_bq_table('clicks')} c
        INNER JOIN {_bq_table('page_properties')} pp
          ON c.event_id = pp.event_id
        WHERE c.event_time BETWEEN @start AND @end
          AND pp.experiment_week = @experiment_week
        GROUP BY c.session_id
        """

        fingerprint_query = f"""
        SELECT
          ce.session_id,
          ce.user_id,
          ce.event_name,
          ce.event_properties,
          ce.event_time
        FROM {_bq_table('custom_events')} ce
        INNER JOIN {_bq_table('page_properties')} pp
          ON ce.event_id = pp.event_id
        WHERE ce.event_time BETWEEN @start AND @end
          AND pp.experiment_week = @experiment_week
        ORDER BY ce.event_time
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("start", "TIMESTAMP", week_start),
                bigquery.ScalarQueryParameter("end", "TIMESTAMP", week_end),
                bigquery.ScalarQueryParameter("experiment_week", "INT64", experiment_week),
            ]
        )
    else:
        # Baseline / no experiment — fall back to production host filtering
        production_host = "web-game-nine-lake.vercel.app"
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
          CAST(NULL AS INT64) AS experiment_week,
          CAST(NULL AS STRING) AS experiment_variant,
          sp.url_host,
          sp.user_agent_browser,
          sp.user_agent_device,
          sp.user_agent_operating_system,
          sp.location_country,
          sp.location_region
        FROM {_bq_table('page_views')} pv
        LEFT JOIN {_bq_table('source_properties')} sp
          ON pv.event_id = sp.event_id
        WHERE pv.event_time BETWEEN @start AND @end
          AND sp.url_host = @production_host
        ORDER BY pv.event_time
        """

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
          AND sp.url_host = @production_host
        GROUP BY c.session_id
        """

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
          AND sp.url_host = @production_host
        ORDER BY ce.event_time
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("start", "TIMESTAMP", week_start),
                bigquery.ScalarQueryParameter("end", "TIMESTAMP", week_end),
                bigquery.ScalarQueryParameter("production_host", "STRING", production_host),
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


def load_exception_requests() -> list[dict]:
    """Load existing exception requests."""
    if not EXCEPTION_REQUESTS_JSON.exists():
        return []
    with open(EXCEPTION_REQUESTS_JSON) as f:
        return json.load(f)


def save_exception_request(request: dict, week: int):
    """Append an exception request from the PM to the queue."""
    requests = load_exception_requests()
    request["week"] = week
    request["timestamp"] = datetime.now(timezone.utc).isoformat()
    request["status"] = "pending"
    requests.append(request)
    with open(EXCEPTION_REQUESTS_JSON, "w") as f:
        json.dump(requests, f, indent=2)
        f.write("\n")
    logger.info("Filed exception request for week %d: %s", week, request.get("constraint", "N/A"))


def git_commit_and_push(message: str):
    """Commit and push the updated experiments.json and exception requests."""
    subprocess.run(
        ["git", "add", str(EXPERIMENTS_JSON), str(EXCEPTION_REQUESTS_JSON)],
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
    logger.info("Pushed experiments.json and exception requests to remote")


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
    experiment_history = experiment_data["experiments"]

    logger.info("Current week: %d → Running pipeline for week %d", current_week, next_week)

    # --- Stage 1: Pull data ---
    logger.info("--- Stage 1: Pull BigQuery data ---")
    running_experiment = get_running_experiment(experiment_data)
    if running_experiment:
        exp_week = running_experiment.get("week")
        session_data = pull_bigquery_data(
            running_experiment["startDate"],
            running_experiment["endDate"],
            experiment_week=exp_week if exp_week != 1 else None,
        )
        logger.info("Pulled %d sessions from BigQuery", len(session_data))
    else:
        session_data = []
        logger.info("No previous experiment — using empty dataset for baseline")

    # --- Stage 1b: Generate AI session summaries via FullStory ---
    logger.info("--- Stage 1b: FullStory AI session summaries ---")
    session_summaries = []
    qualitative_report = {"total_summarized": 0}
    if session_data:
        try:
            session_summaries = summarize_sessions(session_data)
            qualitative_report = aggregate_summaries(session_summaries)
            logger.info(
                "Qualitative report: %d sessions summarized, %s%% understood mechanics",
                qualitative_report.get("total_summarized", 0),
                qualitative_report.get("understood_mechanics_pct", "N/A"),
            )
        except Exception as e:
            logger.warning("Session summary generation failed (non-fatal): %s", e)
    else:
        logger.info("No sessions to summarize")

    # --- Stage 2: Data Scientist analysis ---
    logger.info("--- Stage 2: Data Scientist analysis ---")
    analysis = analyze_data(session_data, experiment_history, qualitative_report)
    logger.info("Analysis summary: %s", analysis.get("summary", "N/A"))

    # --- Stage 3: Close previous experiment and advance main ---
    logger.info("--- Stage 3: Close previous experiment ---")
    if running_experiment:
        winner = close_experiment(experiment_data, analysis)
        if winner and current_week > 1:
            logger.info("Winner: variant %s — advancing main for week %d", winner.upper(), next_week)
            merge_winner(winner, current_week, next_week)
        elif winner and current_week == 1:
            logger.info("Baseline week — skipping merge (no experiment branches exist)")
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

        proposal = propose_experiment(analysis, experiment_history, feedback)
        logger.info("Hypothesis: %s", proposal.get("hypothesis", "N/A"))

        # Handle exception requests from the PM (side-channel, non-blocking)
        exception_req = proposal.pop("exception_request", None)
        if exception_req and isinstance(exception_req, dict):
            save_exception_request(exception_req, next_week)

        # Validate change scope limits before sending to ethics/judge
        files_changed = proposal.get("files_changed", [])
        estimated_lines = proposal.get("estimated_lines_changed", 0)
        change_category = proposal.get("change_category", "config")

        if len(files_changed) > 1:
            feedback = "Change scope violation: experiment modifies more than 1 file. Limit to a single file."
            logger.warning("SCOPE REJECTED: %s", feedback)
            continue
        if estimated_lines > 50:
            feedback = f"Change scope violation: estimated {estimated_lines} lines changed exceeds 50-line limit."
            logger.warning("SCOPE REJECTED: %s", feedback)
            continue
        if change_category == "structural":
            feedback = "Structural changes require an exception request. File one and propose a simpler experiment."
            logger.warning("SCOPE REJECTED: %s", feedback)
            continue

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
    logger.info("--- Stage 5: Engineering implementation (variant B only) ---")
    deployment = implement_experiment(approved_proposal, next_week)
    logger.info(
        "Deployed: A=%s (main), B=%s",
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
