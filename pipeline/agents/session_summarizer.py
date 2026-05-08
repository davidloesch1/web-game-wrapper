"""Session Summarizer — fetches AI-generated session summaries from FullStory.

Uses FullStory's Generate Summary API to produce structured qualitative
assessments of individual game sessions. These summaries label the raw
behavioral fingerprints with semantic meaning: did the player understand
the game, did anything break, what design gaps were exposed?

The summaries are correlated with fingerprint clusters by the Data Scientist
to transform unlabeled behavioral vectors into actionable player archetypes.
"""

import json
import logging
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

FULLSTORY_API_BASE = "https://api.fullstory.com"
PROMPT_PROFILE_ID = os.environ.get(
    "FULLSTORY_PROMPT_PROFILE_ID",
    "2e07d0c0-34b1-441c-96ac-c450915a8f9d",
)
MAX_SESSIONS_TO_SUMMARIZE = int(os.environ.get("MAX_SESSION_SUMMARIES", "50"))
REQUEST_DELAY_SECONDS = 1.5


def _get_api_key() -> str | None:
    key = os.environ.get("FULLSTORY_API_KEY")
    if not key:
        logger.warning("FULLSTORY_API_KEY not set — session summaries disabled")
    return key


def _fs_request(path: str, api_key: str, method: str = "GET", body: dict | None = None) -> dict | str | None:
    """Make an authenticated request to the FullStory API."""
    url = f"{FULLSTORY_API_BASE}{path}"
    headers = {
        "Authorization": f"Basic {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return raw
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.readable() else ""
        logger.warning("FullStory API %s %s returned %d: %s", method, path, e.code, error_body)
        return None
    except Exception as e:
        logger.warning("FullStory API request failed: %s", e)
        return None


def generate_summary(session_id: str, api_key: str) -> dict | None:
    """Generate an AI summary for a single session using the prompt profile.

    Args:
        session_id: FullStory session ID.
        api_key: FullStory API key.

    Returns:
        Structured summary dict from FullStory's AI, or None on failure.
    """
    path = f"/v2/sessions/{session_id}/summaries/{PROMPT_PROFILE_ID}"
    result = _fs_request(path, api_key)

    if result is None:
        logger.warning("Failed to generate summary for session %s", session_id)
        return None

    if isinstance(result, dict) and "response" in result:
        return result["response"]
    if isinstance(result, dict) and "summary" in result:
        return {"session_narrative": result["summary"]}

    return result if isinstance(result, dict) else None


def select_sessions_to_summarize(session_data: list[dict]) -> list[dict]:
    """Select a diverse sample of sessions for AI summarization.

    Prioritizes interesting sessions: very short (bounces), very long
    (power users), high frustration, and a random sample from the middle.
    """
    if not session_data:
        return []

    if len(session_data) <= MAX_SESSIONS_TO_SUMMARIZE:
        return session_data

    scored = []
    for s in session_data:
        score = 0
        duration = s.get("duration_millis") or s.get("active_duration_millis") or 0
        rage = s.get("total_rage_clicks", 0) or 0
        dead = s.get("total_dead_clicks", 0) or 0
        has_fingerprint = bool(s.get("fingerprint_events"))

        if duration < 10_000:
            score += 3
        elif duration > 300_000:
            score += 3
        if rage + dead > 3:
            score += 2
        if has_fingerprint:
            score += 1

        scored.append((score, s))

    scored.sort(key=lambda x: x[0], reverse=True)

    selected = [s for _, s in scored[:MAX_SESSIONS_TO_SUMMARIZE]]
    return selected


def run(session_data: list[dict]) -> list[dict]:
    """Generate AI summaries for a sample of sessions.

    Args:
        session_data: Enriched session records from BigQuery.

    Returns:
        List of dicts, each containing the original session_id and its
        AI-generated summary fields (understood_mechanics, learning_curve_stage,
        functional_issues, design_gaps, frustration_signals, engagement_quality,
        session_narrative).
    """
    api_key = _get_api_key()
    if not api_key:
        return []

    selected = select_sessions_to_summarize(session_data)
    if not selected:
        logger.info("No sessions to summarize")
        return []

    logger.info(
        "Generating AI summaries for %d of %d sessions",
        len(selected), len(session_data),
    )

    summaries = []
    for i, session in enumerate(selected):
        session_id = session.get("session_id")
        if not session_id:
            continue

        summary = generate_summary(session_id, api_key)
        if summary:
            summary["session_id"] = session_id
            summary["experiment_variant"] = session.get("experiment_variant")
            summaries.append(summary)
            logger.info(
                "  [%d/%d] Session %s: %s",
                i + 1, len(selected), session_id,
                summary.get("engagement_quality", "unknown"),
            )
        else:
            logger.warning("  [%d/%d] Session %s: summary failed", i + 1, len(selected), session_id)

        if i < len(selected) - 1:
            time.sleep(REQUEST_DELAY_SECONDS)

    logger.info(
        "Generated %d summaries (%d failed)",
        len(summaries), len(selected) - len(summaries),
    )
    return summaries


def aggregate_summaries(summaries: list[dict]) -> dict:
    """Aggregate individual session summaries into a weekly qualitative report.

    Args:
        summaries: List of individual session summary dicts.

    Returns:
        Aggregated report with counts, distributions, and top issues.
    """
    if not summaries:
        return {"total_summarized": 0}

    learning_stages = {}
    engagement_levels = {}
    all_functional_issues = []
    all_design_gaps = []
    all_frustration_signals = []
    understood_count = 0

    for s in summaries:
        stage = s.get("learning_curve_stage", "unknown")
        learning_stages[stage] = learning_stages.get(stage, 0) + 1

        engagement = s.get("engagement_quality", "unknown")
        engagement_levels[engagement] = engagement_levels.get(engagement, 0) + 1

        if s.get("understood_mechanics"):
            understood_count += 1

        for issue in s.get("functional_issues", []):
            if issue:
                all_functional_issues.append(issue)
        for gap in s.get("design_gaps", []):
            if gap:
                all_design_gaps.append(gap)
        for signal in s.get("frustration_signals", []):
            if signal:
                all_frustration_signals.append(signal)

    # Count frequency of each issue/gap
    def top_items(items: list[str], limit: int = 5) -> list[dict]:
        counts: dict[str, int] = {}
        for item in items:
            normalized = item.strip().lower()
            counts[normalized] = counts.get(normalized, 0) + 1
        sorted_items = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        return [{"issue": k, "count": v} for k, v in sorted_items[:limit]]

    total = len(summaries)
    return {
        "total_summarized": total,
        "understood_mechanics_pct": round(understood_count / total * 100, 1) if total else 0,
        "learning_curve_distribution": learning_stages,
        "engagement_distribution": engagement_levels,
        "top_functional_issues": top_items(all_functional_issues),
        "top_design_gaps": top_items(all_design_gaps),
        "top_frustration_signals": top_items(all_frustration_signals),
        "variant_breakdown": _variant_breakdown(summaries),
    }


def _variant_breakdown(summaries: list[dict]) -> dict:
    """Break down summary metrics by experiment variant (A vs B)."""
    variants: dict[str, list[dict]] = {}
    for s in summaries:
        v = s.get("experiment_variant", "unknown") or "unknown"
        variants.setdefault(v, []).append(s)

    breakdown = {}
    for variant, variant_summaries in variants.items():
        total = len(variant_summaries)
        understood = sum(1 for s in variant_summaries if s.get("understood_mechanics"))
        breakdown[variant] = {
            "count": total,
            "understood_mechanics_pct": round(understood / total * 100, 1) if total else 0,
            "engagement_distribution": {},
        }
        for s in variant_summaries:
            eng = s.get("engagement_quality", "unknown")
            breakdown[variant]["engagement_distribution"][eng] = (
                breakdown[variant]["engagement_distribution"].get(eng, 0) + 1
            )

    return breakdown
