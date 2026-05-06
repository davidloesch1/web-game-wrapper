"""Product Manager agent — proposes a single experiment based on analysis."""

import json

from .llm import call_gemini, load_prompt


def run(
    analysis_report: dict,
    experiment_history: list[dict],
    goal: str,
    feedback: str | None = None,
) -> dict:
    """Propose a single A/B experiment.

    Args:
        analysis_report: Output from the Data Scientist agent.
        experiment_history: All past experiments.
        goal: The highest-order goal from source of truth.
        feedback: Optional rejection feedback from Ethics or Judge.

    Returns:
        Experiment proposal dict with keys: hypothesis,
        variant_a_description, variant_b_description,
        implementation_notes, expected_impact, risk_assessment,
        measurable_criteria.
    """
    system_prompt = load_prompt("product_manager")

    user_payload = {
        "analysis_report": analysis_report,
        "experiment_history": experiment_history,
        "goal": goal,
    }
    if feedback:
        user_payload["rejection_feedback"] = feedback

    return call_gemini(system_prompt, json.dumps(user_payload, indent=2))
