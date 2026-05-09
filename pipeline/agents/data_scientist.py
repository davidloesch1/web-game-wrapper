"""Data Scientist agent — analyzes session data and produces insights."""

import json
from pathlib import Path

from .llm import call_gemini, load_prompt

SOURCE_OF_TRUTH = Path(__file__).parent.parent / "source_of_truth.md"


def run(
    session_data: list[dict],
    experiment_history: list[dict],
    qualitative_report: dict | None = None,
    site_config: dict | None = None,
) -> dict:
    """Analyze user behavior data and return an analysis report.

    Args:
        session_data: List of session records from BigQuery.
        experiment_history: List of past experiment records.
        qualitative_report: Aggregated FullStory AI session summaries.
        site_config: Parsed site config dict (from site_config.load_site_config).

    Returns:
        Analysis report dict.
    """
    system_prompt = load_prompt("data_scientist")
    source_of_truth = SOURCE_OF_TRUTH.read_text()

    payload = {
        "session_data_summary": {
            "total_sessions": len(session_data),
            "sessions": session_data[:200],
        },
        "experiment_history": experiment_history,
        "source_of_truth": source_of_truth,
    }

    if site_config:
        payload["site_config"] = site_config

    if qualitative_report and qualitative_report.get("total_summarized", 0) > 0:
        payload["qualitative_session_summaries"] = qualitative_report

    user_message = json.dumps(payload, indent=2, default=str)

    return call_gemini(system_prompt, user_message)
