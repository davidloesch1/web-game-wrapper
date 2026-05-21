"""Ethics agent — reviews experiments for dark patterns and player safety."""

import json
from pathlib import Path

from .llm import call_gemini, load_prompt

SOURCE_OF_TRUTH = Path(__file__).parent.parent / "source_of_truth.md"


def run(proposal: dict) -> dict:
    """Review an experiment proposal for ethical concerns.

    Args:
        proposal: Experiment proposal from the Product Manager.

    Returns:
        Ethics review dict with keys: approved, concerns, reasoning.
    """
    system_prompt = load_prompt("ethics")
    constraints = SOURCE_OF_TRUTH.read_text()

    user_message = json.dumps({
        "experiment_proposal": proposal,
        "source_of_truth_constraints": constraints,
    }, indent=2)

    return call_gemini(system_prompt, user_message)
