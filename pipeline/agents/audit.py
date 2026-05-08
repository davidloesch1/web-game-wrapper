"""Audit Agent — logs and verifies all pipeline actions for accountability.

STATUS: Placeholder — not yet wired into the pipeline.

INTEGRATION POINT:
    Runs at the very end of the weekly pipeline (after Stage 6), recording
    everything the AI team did during the cycle. Creates an immutable
    audit trail for human review.

TRIGGER:
    Weekly, as the final step of the evolution pipeline.

WHAT IT DOES:
    1. Records a complete audit entry for the week:
       - Data Scientist: what data was analyzed, key findings
       - PM: what was proposed (all attempts, not just the winner)
       - Ethics: approval/rejection decisions with reasoning
       - Judge: scores and feedback for each proposal attempt
       - Engineer: what branches were created, what code was changed
       - Exception requests filed (if any)
    2. Verifies implementation integrity:
       - Checks that the variant-B branch matches the PM's specification
       - Verifies that main (variant A) has the correct experiment.json
       - Confirms the variant-B Vercel preview deployment is live
    3. Validates constraint compliance:
       - Confirms change scope limits were respected
       - Checks that no constraints were bypassed
       - Verifies session value formula wasn't altered
    4. Produces an audit log entry:
       - Structured JSON in `pipeline/audit_log.json`
       - Human-readable summary in `pipeline/audits/week-N.md`
    5. Flags anomalies:
       - Unusually high Judge scores (rubber-stamping?)
       - Ethics approving something previously flagged
       - Large code changes that seem to exceed scope limits

INPUTS:
    - All intermediate outputs from the pipeline run:
      analysis, proposals, ethics reviews, judgments, deployment info
    - Source of Truth document
    - Git diff of experiment branches

OUTPUTS:
    - Audit entry appended to `pipeline/audit_log.json`
    - Human-readable report at `pipeline/audits/week-N.md`
    - Anomaly alerts (if any)

CONFIGURATION:
    - GAME_REPO_URL / GAME_REPO_PAT (for branch verification)
    - No additional secrets needed

GUARDRAILS:
    - Audit agent is read-only — it never modifies code or experiments
    - Audit logs are append-only — never delete previous entries
    - If anomalies are detected, alert human but don't block the pipeline
    - The audit agent itself should not use the same LLM call as other
      agents to avoid self-auditing bias (consider using a different model)
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

AUDIT_LOG_PATH = Path(__file__).parent.parent / "audit_log.json"
AUDITS_DIR = Path(__file__).parent.parent / "audits"


def run(
    week: int,
    analysis: dict,
    proposals: list[dict],
    ethics_reviews: list[dict],
    judgments: list[dict],
    deployment: dict | None,
    exception_requests: list[dict] | None = None,
) -> dict:
    """Create an audit entry for the weekly pipeline run.

    Args:
        week: The experiment week number.
        analysis: Data Scientist's analysis report.
        proposals: All PM proposals attempted (including rejected ones).
        ethics_reviews: All ethics review results.
        judgments: All judge scoring results.
        deployment: Engineering deployment result (None if no experiment launched).
        exception_requests: Any exception requests filed this week.

    Returns:
        Audit entry dict with keys: week, timestamp, summary,
        constraint_compliance, anomalies.
    """
    raise NotImplementedError("Audit agent is not yet implemented")
