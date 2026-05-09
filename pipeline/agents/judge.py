"""Judge agent — scores experiments against the source of truth."""

import json
from pathlib import Path

from .llm import call_gemini, load_prompt

SOURCE_OF_TRUTH = Path(__file__).parent.parent / "source_of_truth.md"


def run(
    proposal: dict,
    experiment_history: list[dict],
    site_config: dict | None = None,
) -> dict:
    """Score and approve/reject an experiment proposal.

    Args:
        proposal: Experiment proposal from the Product Manager.
        experiment_history: All past experiments for context.
        site_config: Parsed site config dict.

    Returns:
        Judgment dict with keys: score, approved,
        alignment_reasoning, feedback, constraint_violations.
    """
    system_prompt = load_prompt("judge")

    payload = {
        "experiment_proposal": proposal,
        "source_of_truth": SOURCE_OF_TRUTH.read_text(),
        "experiment_history": experiment_history,
    }
    if site_config:
        payload["site_config"] = site_config

    user_message = json.dumps(payload, indent=2, default=str)

    return call_gemini(system_prompt, user_message)
