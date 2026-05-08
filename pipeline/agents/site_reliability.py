"""Site Reliability Agent — self-healing pipeline for runtime errors.

Receives error payloads from FullStory Activations (via webhook relay →
GitHub repository_dispatch), triages, diagnoses with AI, and opens a PR
with a minimal defensive fix on the web-game repo.

Triggered by: .github/workflows/self-heal.yml
"""

import json
import logging
import os
import shutil
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

GAME_REPO_URL = os.environ.get(
    "GAME_REPO_URL",
    "https://github.com/davidloesch1/web-game.git",
)
GAME_REPO = os.environ.get("GAME_REPO", "davidloesch1/web-game")

HEALING_LOG_PATH = Path(__file__).parent.parent / "healing_log.json"
ALLOWED_FILES = {"game.js", "style.css", "index.html"}
MAX_FIX_LINES = 10
COOLDOWN_MINUTES = int(os.environ.get("HEALING_COOLDOWN_MINUTES", "30"))
MAX_FIXES_PER_DAY = int(os.environ.get("MAX_FIXES_PER_DAY", "3"))
MIN_CONFIDENCE = 0.6
USER_THRESHOLD = 3


def _load_healing_log() -> list[dict]:
    if HEALING_LOG_PATH.exists():
        with open(HEALING_LOG_PATH) as f:
            return json.load(f)
    return []


def _save_healing_log(log: list[dict]):
    with open(HEALING_LOG_PATH, "w") as f:
        json.dump(log, f, indent=2, default=str)
        f.write("\n")


def _check_cooldown_and_limits() -> str | None:
    """Return a skip reason if cooldown or daily limit is exceeded."""
    log = _load_healing_log()
    now = datetime.now(timezone.utc)

    fixes_today = 0
    for entry in reversed(log):
        ts = entry.get("timestamp", "")
        try:
            entry_time = datetime.fromisoformat(ts)
        except (ValueError, TypeError):
            continue

        delta = (now - entry_time).total_seconds()
        if delta < COOLDOWN_MINUTES * 60:
            return f"Cooldown active — last fix was {int(delta // 60)}m ago (limit: {COOLDOWN_MINUTES}m)"
        if delta < 86400:
            fixes_today += 1

    if fixes_today >= MAX_FIXES_PER_DAY:
        return f"Daily limit reached ({fixes_today}/{MAX_FIXES_PER_DAY} fixes today)"

    return None


def _is_duplicate_error(error_message: str) -> bool:
    """Check if this exact error was already fixed recently."""
    log = _load_healing_log()
    now = datetime.now(timezone.utc)
    for entry in reversed(log):
        if entry.get("error_message") == error_message:
            try:
                entry_time = datetime.fromisoformat(entry["timestamp"])
                if (now - entry_time).total_seconds() < 86400 * 7:
                    return True
            except (ValueError, TypeError, KeyError):
                continue
    return False


def triage(error_payload: dict) -> dict:
    """Evaluate error severity and decide whether to auto-fix.

    Returns:
        Dict with keys: should_fix, severity, reason, skip_reason.
    """
    error_message = error_payload.get("error_message", "")
    error_type = error_payload.get("error_type", "unknown")
    user_count = error_payload.get("user_count", 0)
    session_count = error_payload.get("session_count", 0)
    url = error_payload.get("url", "")

    # Skip experiment branch errors
    if url and "experiment" in url.lower() and "main" not in url.lower():
        return {
            "should_fix": False,
            "severity": "info",
            "reason": "Error is on an experiment branch — not auto-fixing",
            "skip_reason": "experiment_branch",
        }

    # Skip known third-party / extension errors
    third_party_patterns = [
        "chrome-extension://",
        "moz-extension://",
        "fullstory.com",
        "edge.fullstory.com",
        "encoder.min.js",
    ]
    stack = error_payload.get("stack_trace", "")
    if any(p in stack or p in error_message for p in third_party_patterns):
        return {
            "should_fix": False,
            "severity": "info",
            "reason": "Error originates from third-party code or browser extension",
            "skip_reason": "third_party",
        }

    # Check cooldown and daily limits
    limit_reason = _check_cooldown_and_limits()
    if limit_reason:
        return {
            "should_fix": False,
            "severity": "warning",
            "reason": limit_reason,
            "skip_reason": "rate_limited",
        }

    # Check for duplicates
    if _is_duplicate_error(error_message):
        return {
            "should_fix": False,
            "severity": "warning",
            "reason": f"Duplicate error already addressed in the last 7 days: {error_message[:80]}",
            "skip_reason": "duplicate",
        }

    # Classify severity
    if error_type == "uncaught_exception" or user_count >= USER_THRESHOLD:
        severity = "critical"
    elif error_type == "console_error" and session_count >= 2:
        severity = "warning"
    elif error_type == "network_error" and session_count >= 3:
        severity = "warning"
    else:
        severity = "info"

    should_fix = severity in ("critical", "warning")

    return {
        "should_fix": should_fix,
        "severity": severity,
        "reason": f"{error_type} affecting {user_count} users / {session_count} sessions",
        "skip_reason": None if should_fix else "low_severity",
    }


def _identify_source_file(error_payload: dict) -> str | None:
    """Determine which game file the error originates from."""
    stack = error_payload.get("stack_trace", "")
    error_msg = error_payload.get("error_message", "")
    url = error_payload.get("url", "")
    combined = f"{stack} {error_msg} {url}"

    for fname in ALLOWED_FILES:
        if fname in combined:
            return fname

    # Default to game.js for JS errors
    error_type = error_payload.get("error_type", "")
    if error_type in ("console_error", "uncaught_exception"):
        return "game.js"
    if error_type == "network_error":
        return "game.js"
    return None


def diagnose(error_payload: dict, work_dir: str) -> dict:
    """Use AI to identify root cause and propose a fix.

    Returns the AI's diagnosis dict or a skip result.
    """
    from agents.llm import load_prompt, call_gemini

    source_file = _identify_source_file(error_payload)
    if not source_file:
        return {"should_fix": False, "skip_reason": "unknown_source_file"}

    source_path = os.path.join(work_dir, source_file)
    if not os.path.exists(source_path):
        return {"should_fix": False, "skip_reason": f"file_not_found: {source_file}"}

    with open(source_path) as f:
        source_code = f.read()

    # Get recent git history
    result = subprocess.run(
        ["git", "log", "--oneline", "-20"],
        cwd=work_dir, capture_output=True, text=True,
    )
    recent_commits = result.stdout if result.returncode == 0 else "(unavailable)"

    system_prompt = load_prompt("site_reliability")
    user_message = json.dumps({
        "error_message": error_payload.get("error_message", ""),
        "error_type": error_payload.get("error_type", ""),
        "stack_trace": error_payload.get("stack_trace", ""),
        "url": error_payload.get("url", ""),
        "user_count": error_payload.get("user_count", 0),
        "session_count": error_payload.get("session_count", 0),
        "console_errors": error_payload.get("console_errors", []),
        "network_errors": error_payload.get("network_errors", []),
        "source_file": source_file,
        "source_code": source_code,
        "recent_commits": recent_commits,
    }, indent=2)

    logger.info("Sending error context to AI for diagnosis (%s, %d chars of source)",
                source_file, len(source_code))

    diagnosis = call_gemini(system_prompt, user_message, json_output=True)

    if not isinstance(diagnosis, dict):
        return {"should_fix": False, "skip_reason": "ai_returned_non_dict"}

    return diagnosis


def validate_fix(diagnosis: dict, work_dir: str) -> str | None:
    """Validate the proposed fix is safe and within scope.

    Returns an error string if invalid, None if OK.
    """
    file_to_change = diagnosis.get("file_to_change", "")
    if file_to_change not in ALLOWED_FILES:
        return f"File '{file_to_change}' not in allowed set: {ALLOWED_FILES}"

    original_code = diagnosis.get("original_code", "")
    fixed_code = diagnosis.get("fixed_code", "")
    if not original_code or not fixed_code:
        return "Missing original_code or fixed_code in diagnosis"

    if original_code == fixed_code:
        return "Fix is identical to original — no change"

    # Check line count diff
    orig_lines = original_code.strip().splitlines()
    fix_lines = fixed_code.strip().splitlines()
    diff_lines = abs(len(fix_lines) - len(orig_lines)) + sum(
        1 for a, b in zip(orig_lines, fix_lines) if a != b
    )
    if diff_lines > MAX_FIX_LINES:
        return f"Fix changes {diff_lines} lines (max: {MAX_FIX_LINES})"

    confidence = diagnosis.get("confidence", 0)
    if confidence < MIN_CONFIDENCE:
        return f"Confidence too low: {confidence:.0%} (min: {MIN_CONFIDENCE:.0%})"

    # Verify the original_code actually exists in the file
    source_path = os.path.join(work_dir, file_to_change)
    with open(source_path) as f:
        full_source = f.read()
    if original_code not in full_source:
        return "original_code block not found in source file — AI hallucinated the match"

    return None


def _apply_fix(diagnosis: dict, work_dir: str) -> bool:
    """Apply the fix to the source file. Returns True on success."""
    file_to_change = diagnosis["file_to_change"]
    source_path = os.path.join(work_dir, file_to_change)

    with open(source_path) as f:
        content = f.read()

    new_content = content.replace(
        diagnosis["original_code"],
        diagnosis["fixed_code"],
        1,
    )

    if new_content == content:
        logger.error("Replace had no effect — original_code not found")
        return False

    with open(source_path, "w") as f:
        f.write(new_content)

    return True


def _create_pr(diagnosis: dict, error_payload: dict, work_dir: str) -> str | None:
    """Create a branch, commit the fix, push, and open a PR. Returns PR URL."""
    token = os.environ.get("GAME_REPO_PAT") or os.environ.get("GITHUB_TOKEN", "")
    if not token:
        logger.error("No GAME_REPO_PAT — cannot create PR")
        return None

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    branch_name = f"self-heal/{timestamp}"
    error_msg_short = (diagnosis.get("fix_description", "") or
                       error_payload.get("error_message", "unknown"))[:60]

    def _git(args: list[str]):
        r = subprocess.run(["git"] + args, cwd=work_dir, capture_output=True, text=True)
        if r.returncode != 0:
            logger.error("git %s failed: %s", " ".join(args), r.stderr)
            raise RuntimeError(f"git {' '.join(args)} failed: {r.stderr}")
        return r.stdout

    _git(["checkout", "-b", branch_name])
    _git(["add", diagnosis["file_to_change"]])
    _git(["commit", "-m", f"[self-heal] {error_msg_short}"])
    _git(["push", "-u", "origin", branch_name])

    # Create PR via GitHub API
    pr_body = (
        f"## Self-Healing Fix\n\n"
        f"**Error**: `{error_payload.get('error_message', 'N/A')[:200]}`\n"
        f"**Type**: {error_payload.get('error_type', 'unknown')}\n"
        f"**Users affected**: {error_payload.get('user_count', '?')}\n"
        f"**Sessions**: {error_payload.get('session_count', '?')}\n\n"
        f"### Diagnosis\n{diagnosis.get('diagnosis', 'N/A')}\n\n"
        f"### Fix\n{diagnosis.get('fix_description', 'N/A')}\n\n"
        f"**File**: `{diagnosis.get('file_to_change', '?')}`\n"
        f"**Confidence**: {diagnosis.get('confidence', 0):.0%}\n"
        f"**Risk**: {diagnosis.get('risk_assessment', 'N/A')}\n\n"
        f"---\n*Generated by the Site Reliability agent. "
        f"Review before merging.*"
    )

    pr_data = json.dumps({
        "title": f"[self-heal] {error_msg_short}",
        "head": branch_name,
        "base": "main",
        "body": pr_body,
    }).encode()

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "sre-agent",
    }

    pr_url_api = f"https://api.github.com/repos/{GAME_REPO}/pulls"
    try:
        req = urllib.request.Request(pr_url_api, data=pr_data, headers=headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            pr_result = json.loads(resp.read())
            pr_url = pr_result.get("html_url", "")
            logger.info("PR created: %s", pr_url)
            return pr_url
    except Exception as e:
        logger.error("Failed to create PR: %s", e)
        return None


def run(error_payload: dict, work_dir: str = "/tmp/game-sre") -> dict:
    """Execute the full self-healing pipeline for a detected error.

    1. Triage → decide if worth fixing
    2. Clone game repo
    3. Diagnose with AI → get proposed fix
    4. Validate fix is safe and within scope
    5. Apply fix, create branch, open PR
    6. Log everything

    Returns:
        Dict with action_taken, severity, pr_url, details.
    """
    from agents.llm import configure as configure_llm
    configure_llm()

    logger.info("=" * 50)
    logger.info("Self-healing pipeline triggered")
    logger.info("Error: %s", error_payload.get("error_message", "N/A")[:200])
    logger.info("Type: %s | Users: %s | Sessions: %s",
                error_payload.get("error_type"),
                error_payload.get("user_count"),
                error_payload.get("session_count"))

    # Step 1: Triage
    triage_result = triage(error_payload)
    logger.info("Triage: severity=%s, should_fix=%s, reason=%s",
                triage_result["severity"],
                triage_result["should_fix"],
                triage_result["reason"])

    if not triage_result["should_fix"]:
        _log_entry(error_payload, triage_result, action="skipped")
        return {
            "action_taken": "skipped",
            "severity": triage_result["severity"],
            "reason": triage_result.get("skip_reason") or triage_result["reason"],
            "pr_url": None,
        }

    # Step 2: Clone game repo
    if os.path.exists(work_dir):
        shutil.rmtree(work_dir)
    logger.info("Cloning game repo...")
    subprocess.run(
        ["git", "clone", GAME_REPO_URL, work_dir],
        capture_output=True, text=True, check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "SRE Agent"],
        cwd=work_dir, capture_output=True, text=True,
    )
    subprocess.run(
        ["git", "config", "user.email", "sre@self-evolving-game.dev"],
        cwd=work_dir, capture_output=True, text=True,
    )

    # Step 3: Diagnose
    diagnosis = diagnose(error_payload, work_dir)
    logger.info("Diagnosis: should_fix=%s, confidence=%s",
                diagnosis.get("should_fix", "?"),
                diagnosis.get("confidence", "?"))

    if not diagnosis.get("should_fix", True):
        _log_entry(error_payload, triage_result, diagnosis=diagnosis, action="skipped_by_ai")
        return {
            "action_taken": "skipped_by_ai",
            "severity": triage_result["severity"],
            "reason": diagnosis.get("skip_reason", "AI declined to fix"),
            "pr_url": None,
        }

    # Step 4: Validate
    validation_error = validate_fix(diagnosis, work_dir)
    if validation_error:
        logger.warning("Fix validation failed: %s", validation_error)
        _log_entry(error_payload, triage_result, diagnosis=diagnosis,
                   action="validation_failed", details=validation_error)
        return {
            "action_taken": "validation_failed",
            "severity": triage_result["severity"],
            "reason": validation_error,
            "pr_url": None,
        }

    # Step 5: Apply fix and create PR
    if not _apply_fix(diagnosis, work_dir):
        _log_entry(error_payload, triage_result, diagnosis=diagnosis,
                   action="apply_failed")
        return {
            "action_taken": "apply_failed",
            "severity": triage_result["severity"],
            "reason": "Failed to apply fix to source file",
            "pr_url": None,
        }

    pr_url = _create_pr(diagnosis, error_payload, work_dir)
    action = "pr_created" if pr_url else "pr_failed"

    _log_entry(error_payload, triage_result, diagnosis=diagnosis,
               action=action, pr_url=pr_url)

    logger.info("Self-healing complete: %s", action)
    return {
        "action_taken": action,
        "severity": triage_result["severity"],
        "reason": diagnosis.get("fix_description", ""),
        "pr_url": pr_url,
    }


def _log_entry(
    error_payload: dict,
    triage_result: dict,
    diagnosis: dict | None = None,
    action: str = "unknown",
    pr_url: str | None = None,
    details: str | None = None,
):
    """Append an entry to the healing log."""
    log = _load_healing_log()
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "error_message": error_payload.get("error_message", "")[:500],
        "error_type": error_payload.get("error_type", ""),
        "severity": triage_result.get("severity", ""),
        "user_count": error_payload.get("user_count", 0),
        "session_count": error_payload.get("session_count", 0),
    }
    if diagnosis:
        entry["diagnosis"] = diagnosis.get("diagnosis", "")[:500]
        entry["file_changed"] = diagnosis.get("file_to_change", "")
        entry["confidence"] = diagnosis.get("confidence", 0)
        entry["fix_description"] = diagnosis.get("fix_description", "")[:300]
    if pr_url:
        entry["pr_url"] = pr_url
    if details:
        entry["details"] = details

    log.append(entry)

    # Keep log to last 100 entries
    if len(log) > 100:
        log = log[-100:]

    _save_healing_log(log)
