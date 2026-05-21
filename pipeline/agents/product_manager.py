"""Product Manager agent — proposes a single experiment based on analysis."""

import json
import os
from pathlib import Path

from .llm import call_gemini, load_prompt

PIPELINE_DIR = Path(__file__).resolve().parent.parent
SOURCE_OF_TRUTH_PATH = PIPELINE_DIR / "source_of_truth.md"


def _load_source_of_truth() -> str:
    return SOURCE_OF_TRUTH_PATH.read_text()


def run(
    analysis_report: dict,
    experiment_history: list[dict],
    feedback: str | None = None,
) -> dict:
    """Propose a single A/B experiment.

    The full Source of Truth document is loaded automatically and included
    in the payload so the PM has complete context on goals, constraints,
    change scope limits, and the exception request process.

    Args:
        analysis_report: Output from the Data Scientist agent.
        experiment_history: All past experiments.
        feedback: Optional rejection feedback from Ethics or Judge.

    Returns:
        Experiment proposal dict with keys: hypothesis,
        variant_a_description, variant_b_description,
        implementation_notes, expected_impact, risk_assessment,
        measurable_criteria, files_changed, estimated_lines_changed,
        change_category, and optionally exception_request.
    """
    system_prompt = load_prompt("product_manager")

    source_of_truth = _load_source_of_truth()

    user_payload = {
        "analysis_report": analysis_report,
        "experiment_history": experiment_history,
        "source_of_truth": source_of_truth,
    }
    if feedback:
        user_payload["rejection_feedback"] = feedback

    return call_gemini(system_prompt, json.dumps(user_payload, indent=2))
