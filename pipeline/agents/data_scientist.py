"""Data Scientist agent — analyzes weekly session data and produces insights."""

import json

from .llm import call_gemini, load_prompt


def run(session_data: list[dict], experiment_history: list[dict]) -> dict:
    """Analyze player behavior data and return an analysis report.

    Args:
        session_data: List of session records from BigQuery.
        experiment_history: List of past experiment records.

    Returns:
        Analysis report dict with keys: summary, player_clusters,
        key_correlations, dropoff_patterns, ab_comparison,
        recommendations, sample_size, confidence_notes.
    """
    system_prompt = load_prompt("data_scientist")

    user_message = json.dumps({
        "session_data_summary": {
            "total_sessions": len(session_data),
            "sessions": session_data[:200],  # cap to avoid token overflow
        },
        "experiment_history": experiment_history,
    }, indent=2)

    return call_gemini(system_prompt, user_message)
