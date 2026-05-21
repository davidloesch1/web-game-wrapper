"""Data Scientist agent — analyzes weekly session data and produces insights."""

import json
from pathlib import Path

from .llm import call_gemini, load_prompt

SOURCE_OF_TRUTH = Path(__file__).parent.parent / "source_of_truth.md"


def run(
    session_data: list[dict],
    experiment_history: list[dict],
    qualitative_report: dict | None = None,
) -> dict:
    """Analyze player behavior data and return an analysis report.

    Receives both quantitative data (BigQuery sessions) and qualitative
    data (FullStory AI session summaries) for a complete picture of
    player behavior and experience quality.

    Args:
        session_data: List of session records from BigQuery.
        experiment_history: List of past experiment records.
        qualitative_report: Aggregated FullStory AI session summaries
            with player comprehension, design gaps, and frustration data.

    Returns:
        Analysis report dict with keys: summary, player_clusters,
        key_correlations, dropoff_patterns, ab_comparison,
        session_value_breakdown, qualitative_insights, recommendations,
        sample_size, confidence_notes.
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

    if qualitative_report and qualitative_report.get("total_summarized", 0) > 0:
        payload["qualitative_session_summaries"] = qualitative_report

    user_message = json.dumps(payload, indent=2)

    return call_gemini(system_prompt, user_message)
