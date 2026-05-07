"""Source of Truth Guardian — validates changes to the governing document.

STATUS: Placeholder — not yet wired into a workflow.

INTEGRATION POINT:
    Runs as a SEPARATE GitHub Actions workflow triggered on push/PR events
    that modify `pipeline/source_of_truth.md`. Acts as an automated
    reviewer for the most critical file in the system.

TRIGGER:
    GitHub Actions `on: push` or `on: pull_request` with path filter:
      paths: ['pipeline/source_of_truth.md']

WHAT IT DOES:
    1. Validates internal consistency of the Source of Truth:
       - Session value weights sum to 1.0 (100%)
       - All referenced metrics have clear definitions
       - Constraints don't contradict each other
       - Change scope limits are numerically valid
    2. Detects risky changes:
       - Constraints being removed or significantly relaxed
       - Session value weights being rebalanced dramatically
       - New permissions that could enable dark patterns
       - Change scope limits being raised above safe thresholds
    3. Reviews pending exception requests:
       - Reads `pipeline/exception_requests.json`
       - Summarizes which requests are still pending
       - Checks if any approved exceptions are reflected in the update
    4. Generates a review comment:
       - If triggered by PR: posts a review comment with findings
       - If triggered by push: creates a GitHub Issue if concerns found
    5. Maintains a changelog of Source of Truth modifications:
       - What changed, when, and a diff summary
       - Stored in `pipeline/source_of_truth_changelog.json`

INPUTS:
    - The modified source_of_truth.md (new version)
    - The previous version (from git diff)
    - exception_requests.json (pending requests)

OUTPUTS:
    - Validation result with keys: valid, warnings, errors,
      risk_assessment, exception_request_summary
    - PR review comment or GitHub Issue (if concerns found)

CONFIGURATION:
    - GITHUB_TOKEN (already available)
    - No additional secrets needed

GUARDRAILS:
    - This agent is advisory only — it cannot block merges
    - Never auto-modify the Source of Truth
    - Flag changes, don't judge them — the human owner has final say
    - Track all changes for historical reference
    - If weights don't sum to 1.0, that's an ERROR not a warning
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

SOURCE_OF_TRUTH_PATH = Path(__file__).parent.parent / "source_of_truth.md"


def validate(new_content: str, old_content: str | None = None) -> dict:
    """Validate a new version of the Source of Truth document.

    Args:
        new_content: The updated source_of_truth.md content.
        old_content: The previous version for diff analysis.

    Returns:
        Validation result dict with keys: valid, warnings, errors,
        risk_assessment, diff_summary.
    """
    raise NotImplementedError(
        "Source of Truth Guardian agent is not yet implemented"
    )


def review_exception_requests(
    source_of_truth: str,
    exception_requests: list[dict],
) -> dict:
    """Summarize pending exception requests against current constraints.

    Args:
        source_of_truth: Current source_of_truth.md content.
        exception_requests: All exception requests from the queue.

    Returns:
        Summary dict with pending, approved, and denied requests.
    """
    raise NotImplementedError(
        "Source of Truth Guardian agent is not yet implemented"
    )


def run(new_content: str, old_content: str | None = None) -> dict:
    """Run the full guardian review.

    Args:
        new_content: Updated source_of_truth.md.
        old_content: Previous version.

    Returns:
        Full review dict.
    """
    raise NotImplementedError(
        "Source of Truth Guardian agent is not yet implemented"
    )
