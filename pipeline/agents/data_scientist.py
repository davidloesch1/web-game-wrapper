"""Data Scientist agent — analyzes weekly session data and produces insights."""

import json
from pathlib import Path

from .llm import call_gemini, load_prompt

SOURCE_OF_TRUTH = Path(__file__).parent.parent / "source_of_truth.md"


def run(session_data: list[dict], experiment_history: list[dict]) -> dict:
    """Analyze player behavior data and return an analysis report.

    The Source of Truth is included so the Data Scientist can compute
    session value using the exact formula and weights defined by the owner.

    Args:
        session_data: List of session records from BigQuery.
        experiment_history: List of past experiment records.

    Returns:
        Analysis report dict with keys: summary, player_clusters,
        key_correlations, dropoff_patterns, ab_comparison,
        session_value_breakdown, recommendations, sample_size,
        confidence_notes.
    """
    system_prompt = load_prompt("data_scientist")
    source_of_truth = SOURCE_OF_TRUTH.read_text()

    user_message = json.dumps({
        "session_data_summary": {
            "total_sessions": len(session_data),
            "sessions": session_data[:200],
        },
        "experiment_history": experiment_history,
        "source_of_truth": source_of_truth,
    }, indent=2)

    return call_gemini(system_prompt, user_message)
