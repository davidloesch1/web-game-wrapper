"""Product Manager agent — proposes a single experiment based on analysis."""

import json
from pathlib import Path

from .llm import call_gemini, load_prompt

PIPELINE_DIR = Path(__file__).resolve().parent.parent
SOURCE_OF_TRUTH_PATH = PIPELINE_DIR / "source_of_truth.md"


def run(
    analysis_report: dict,
    experiment_history: list[dict],
    feedback: str | None = None,
    site_config: dict | None = None,
) -> dict:
    """Propose a single experiment.

    Args:
        analysis_report: Output from the Data Scientist agent.
        experiment_history: All past experiments.
        feedback: Optional rejection feedback from Ethics or Judge.
        site_config: Parsed site config dict.

    Returns:
        Experiment proposal dict.
    """
    system_prompt = load_prompt("product_manager")

    user_payload = {
        "analysis_report": analysis_report,
        "experiment_history": experiment_history,
        "source_of_truth": SOURCE_OF_TRUTH_PATH.read_text(),
    }
    if site_config:
        user_payload["site_config"] = site_config
    if feedback:
        user_payload["rejection_feedback"] = feedback

    return call_gemini(system_prompt, json.dumps(user_payload, indent=2, default=str))
