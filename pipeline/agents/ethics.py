"""Ethics agent — reviews experiments for dark patterns and user safety."""

import json
from pathlib import Path

from .llm import call_gemini, load_prompt

SOURCE_OF_TRUTH = Path(__file__).parent.parent / "source_of_truth.md"


def run(proposal: dict, site_config: dict | None = None) -> dict:
    """Review an experiment proposal for ethical concerns.

    Args:
        proposal: Experiment proposal from the Product Manager.
        site_config: Parsed site config dict.

    Returns:
        Ethics review dict with keys: approved, concerns, reasoning.
    """
    system_prompt = load_prompt("ethics")

    payload = {
        "experiment_proposal": proposal,
        "source_of_truth_constraints": SOURCE_OF_TRUTH.read_text(),
    }
    if site_config:
        payload["site_config"] = site_config

    return call_gemini(system_prompt, json.dumps(payload, indent=2, default=str))
