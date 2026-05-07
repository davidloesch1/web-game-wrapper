"""Retrospective Agent — monthly strategic review of experiment history.

STATUS: Placeholder — not yet wired into the pipeline.

INTEGRATION POINT:
    Runs as a conditional step at the end of the weekly pipeline, triggered
    every 4th week (when week % 4 == 0). Produces a monthly report and
    feeds strategic insights back into the PM and Judge agents.

TRIGGER:
    Every 4 weeks (conditional within the weekly pipeline).
    Can also be triggered manually via workflow_dispatch.

WHAT IT DOES:
    1. Reviews the last 4 weeks of experiments holistically:
       - What was tested, what won, what lost
       - Net change in session value over the month
       - Which session value factors improved vs declined
    2. Identifies meta-patterns across experiments:
       - "All UI changes won, all mechanic changes lost"
       - "Experiments targeting active time have higher success rates"
       - "Grid size changes have diminishing returns"
    3. Evaluates the session value score calibration:
       - Are the weights still appropriate?
       - Is any single factor dominating or being ignored?
       - Should the formula be adjusted? (filed as exception request)
    4. Assesses experiment velocity and quality:
       - How many proposals were rejected before approval?
       - Are the PM's hypotheses getting more accurate over time?
       - Is the Judge's scoring consistent?
    5. Produces a monthly report:
       - Executive summary for the human owner
       - Strategic recommendations for the next month
       - Exception requests for Source of Truth adjustments
    6. Archives the report in `pipeline/retrospectives/`

INPUTS:
    - experiments.json (full history)
    - Source of Truth document
    - Data Scientist analysis reports from the last 4 weeks
    - Exception requests log

OUTPUTS:
    - Dict with keys: executive_summary, meta_patterns,
      calibration_assessment, velocity_metrics, strategic_recommendations,
      exception_requests
    - Saved to `pipeline/retrospectives/month-N.md`

CONFIGURATION:
    - GEMINI_API_KEY (already available)
    - RETROSPECTIVE_INTERVAL_WEEKS (default: 4)

GUARDRAILS:
    - Recommendations are advisory — the human makes Source of Truth changes
    - Don't recommend removing constraints, only relaxing or adding
    - Base all conclusions on data, not speculation
    - Explicitly state confidence levels for meta-pattern claims
    - Flag when sample sizes are too small for reliable conclusions
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

RETROSPECTIVES_DIR = Path(__file__).parent.parent / "retrospectives"


def run(
    experiment_data: dict,
    source_of_truth: str,
    recent_analyses: list[dict] | None = None,
) -> dict:
    """Produce a monthly retrospective report.

    Args:
        experiment_data: Full experiments.json data.
        source_of_truth: Contents of source_of_truth.md.
        recent_analyses: Data Scientist reports from recent weeks.

    Returns:
        Retrospective report dict.
    """
    raise NotImplementedError("Retrospective agent is not yet implemented")
