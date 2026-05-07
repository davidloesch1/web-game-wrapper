"""Site Reliability Agent — self-healing pipeline for runtime errors.

STATUS: Placeholder — not yet wired into a workflow.

INTEGRATION POINT:
    Runs as a SEPARATE GitHub Actions workflow (`self-heal.yml`), triggered
    by a `repository_dispatch` event from a webhook relay that receives
    FullStory Activations streams.

    This is NOT part of the weekly evolution pipeline — it runs on-demand
    whenever errors are detected in production.

TRIGGER:
    FullStory Activations webhook → Relay function → GitHub repository_dispatch

    Activations should be configured to fire on:
    - Console errors (JS exceptions, uncaught errors)
    - Network errors (failed fetch/XHR calls, 4xx/5xx responses)
    - Rage clicks coinciding with errors (broken UI indicators)

WHAT IT DOES:
    1. TRIAGE: Evaluates the incoming error payload
       - How many users affected? (threshold: 3+ users in 1 hour)
       - Is this a new error or a known/recurring one?
       - Is it on main or an experiment branch?
       - Severity classification: critical / warning / info
    2. DIAGNOSE: AI reads the error context + source code
       - Error message and stack trace
       - The relevant source file(s) from the game repo
       - Recent git history (did a recent change introduce this?)
       - FullStory session context (what was the user doing?)
    3. FIX: AI proposes a minimal code change
       - Maximum 10 lines changed (this is a fix, not a feature)
       - Only the file where the error originates
       - Must not change game mechanics or UI
       - Purely defensive: null checks, try/catch, fallback values
    4. VALIDATE: Syntax check the proposed fix
    5. DEPLOY: Commit to main with `[self-heal]` prefix
    6. MONITOR: Check if error rate decreases after fix
       - If error rate INCREASES, auto-revert the commit
    7. NOTIFY: Post to Slack/GitHub Issue/email

INPUTS:
    - Error payload from FullStory Activations (via webhook relay):
      {error_message, stack_trace, url, user_count, session_ids,
       console_errors, network_errors}
    - Game source code (cloned from repo)
    - Recent git log

OUTPUTS:
    - Fix commit on main (or revert if fix worsens things)
    - Notification to human owner
    - Healing log entry in `pipeline/healing_log.json`

CONFIGURATION:
    - GAME_REPO_URL / GAME_REPO_PAT (already available)
    - GEMINI_API_KEY (already available)
    - SLACK_WEBHOOK_URL (optional, for notifications)
    - HEALING_COOLDOWN_MINUTES (default: 30)
    - MAX_FIXES_PER_DAY (default: 3)

GUARDRAILS:
    - Cool-down period: no fixes for 30 minutes after a deployment
    - Max 3 auto-fixes per 24 hours — after that, escalate to human
    - Auto-rollback if error rate increases post-fix
    - NEVER fix experiment branches — only main (keep experiment data clean)
    - Scope lock: can only touch game.js, style.css, or index.html
    - No new files, no dependency changes
    - All fixes logged with full context for human review

WEBHOOK RELAY:
    A small serverless function (Cloudflare Worker, Railway, or Vercel
    serverless) that receives the FullStory Activations webhook and
    translates it into a GitHub repository_dispatch event:

        POST https://api.github.com/repos/davidloesch1/web-game-wrapper/dispatches
        {
          "event_type": "fullstory-error",
          "client_payload": { ...error details from FullStory... }
        }

    This relay is needed because FullStory Activations can't directly
    trigger GitHub Actions.
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

HEALING_LOG_PATH = Path(__file__).parent.parent / "healing_log.json"
MAX_FIX_LINES = 10
COOLDOWN_MINUTES = int(os.environ.get("HEALING_COOLDOWN_MINUTES", "30"))
MAX_FIXES_PER_DAY = int(os.environ.get("MAX_FIXES_PER_DAY", "3"))


def triage(error_payload: dict) -> dict:
    """Evaluate error severity and decide whether to auto-fix.

    Args:
        error_payload: Error details from FullStory Activations webhook.

    Returns:
        Triage result with keys: should_fix, severity, reason.
    """
    raise NotImplementedError("Site Reliability agent is not yet implemented")


def diagnose(error_payload: dict, source_code: str, git_log: str) -> dict:
    """Identify root cause and propose a fix.

    Args:
        error_payload: Error details from triage.
        source_code: Contents of the file where the error occurred.
        git_log: Recent git history for context.

    Returns:
        Diagnosis with keys: root_cause, proposed_fix, file_to_change,
        confidence_score.
    """
    raise NotImplementedError("Site Reliability agent is not yet implemented")


def validate_fix(original_code: str, fixed_code: str) -> bool:
    """Check that the proposed fix is syntactically valid and within scope.

    Args:
        original_code: Original file contents.
        fixed_code: Proposed fixed file contents.

    Returns:
        True if the fix passes validation.
    """
    raise NotImplementedError("Site Reliability agent is not yet implemented")


def run(error_payload: dict) -> dict:
    """Execute the full self-healing pipeline for a detected error.

    Args:
        error_payload: Error details from FullStory Activations.

    Returns:
        Healing result with keys: action_taken, commit_sha, details.
    """
    raise NotImplementedError("Site Reliability agent is not yet implemented")
