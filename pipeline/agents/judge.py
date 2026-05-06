"""Judge agent — scores experiments against the source of truth."""

import json
from pathlib import Path

from .llm import call_gemini, load_prompt

SOURCE_OF_TRUTH = Path(__file__).parent.parent / "source_of_truth.md"


def run(proposal: dict, experiment_history: list[dict]) -> dict:
    """Score and approve/reject an experiment proposal.

    Args:
        proposal: Experiment proposal from the Product Manager.
        experiment_history: All past experiments for context.

    Returns:
        Judgment dict with keys: score, approved,
        alignment_reasoning, feedback, constraint_violations.
    """
    system_prompt = load_prompt("judge")
    source_of_truth = SOURCE_OF_TRUTH.read_text()

    user_message = json.dumps({
        "experiment_proposal": proposal,
        "source_of_truth": source_of_truth,
        "experiment_history": experiment_history,
    }, indent=2)

    return call_gemini(system_prompt, user_message)
