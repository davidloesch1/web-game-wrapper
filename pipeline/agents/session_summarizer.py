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
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

FULLSTORY_API_BASE = "https://api.fullstory.com"
BEHAVIORAL_PROFILE_ID = os.environ.get(
    "FULLSTORY_BEHAVIORAL_PROFILE_ID",
    "d904a09b-80d2-4d38-81bf-6784a500da6a",
)
LEGACY_PROFILE_ID = "2e07d0c0-34b1-441c-96ac-c450915a8f9d"
PROMPT_PROFILE_ID = os.environ.get(
    "FULLSTORY_PROMPT_PROFILE_ID",
    BEHAVIORAL_PROFILE_ID,
)
MAX_SESSIONS_TO_SUMMARIZE = int(os.environ.get("MAX_SESSION_SUMMARIES", "50"))
REQUEST_DELAY_SECONDS = 1.5


def _get_api_key() -> str | None:
    key = os.environ.get("FULLSTORY_API_KEY")
    if not key:
        logger.warning("FULLSTORY_API_KEY not set — session summaries disabled")
    else:
        logger.info("FULLSTORY_API_KEY is set (length %d)", len(key))
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

    logger.debug("FullStory API request: %s %s", method, url)

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            logger.debug("FullStory API response (%d): %s", resp.status, raw[:200])
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return raw
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.readable() else ""
        logger.error("FullStory API %s %s returned %d: %s", method, url, e.code, error_body[:500])
        return None
    except Exception as e:
        logger.error("FullStory API request to %s failed: %s", url, e)
        return None


def _build_api_session_id(session: dict) -> str | None:
    """Build a FullStory API session ID from BigQuery fields.

    The Server API expects device_id:session_id (URL-encoded).
    BigQuery stores these as separate fields or combined.
    """
    raw_id = session.get("session_id", "")
    if not raw_id:
        return None

    if ":" in str(raw_id):
        return urllib.parse.quote(str(raw_id), safe="")

    device_id = session.get("device_id") or session.get("user_id")
    if device_id:
        combined = f"{device_id}:{raw_id}"
        return urllib.parse.quote(combined, safe="")

    return urllib.parse.quote(str(raw_id), safe="")


def generate_summary(session_id: str, api_key: str, session: dict | None = None) -> dict | None:
    """Generate an AI summary for a single session using the prompt profile.

    Tries the FullStory Generate Summary GET endpoint. The endpoint format is:
    GET /v2/sessions/{session_id}/summaries/{profile_id}

    The session_id must be URL-encoded (: becomes %3A).
    """
    if session:
        encoded_id = _build_api_session_id(session)
    else:
        encoded_id = urllib.parse.quote(str(session_id), safe="")

    if not encoded_id:
        logger.warning("Could not build API session ID for %s", session_id)
        return None

    logger.info("  Requesting summary for session_id=%s (encoded=%s)", session_id, encoded_id)

    path = f"/v2/sessions/{encoded_id}/summary?config_profile={PROMPT_PROFILE_ID}"
    result = _fs_request(path, api_key)

    if result is None:
        logger.warning("  Summary request failed for session %s", session_id)
        return None

    logger.info("  Summary response type=%s keys=%s",
                type(result).__name__,
                list(result.keys()) if isinstance(result, dict) else "N/A")

    if isinstance(result, dict) and "response" in result:
        return result["response"]
    if isinstance(result, dict) and "summary" in result:
        return {"session_narrative": result["summary"]}

    return result if isinstance(result, dict) else None


def select_sessions_to_summarize(session_data: list[dict]) -> list[dict]:
    """Select a stratified sample of sessions for AI summarization.

    Allocates the budget across three tiers to avoid over-representing
    outliers while still capturing the most informative sessions:
      - 30% extreme/interesting (short bounces, power users, high frustration)
      - 50% random from the middle tier
      - 20% variant-balanced (equal A/B representation)

    Within each tier, sessions with fingerprint data are preferred.
    """
    import random

    if not session_data:
        return []

    if len(session_data) <= MAX_SESSIONS_TO_SUMMARIZE:
        return session_data

    budget = MAX_SESSIONS_TO_SUMMARIZE
    extreme_budget = max(1, int(budget * 0.30))
    variant_budget = max(1, int(budget * 0.20))
    middle_budget = budget - extreme_budget - variant_budget

    def _interest_score(s: dict) -> int:
        score = 0
        duration = s.get("duration_millis") or s.get("active_duration_millis") or 0
        rage = s.get("total_rage_clicks", 0) or 0
        dead = s.get("total_dead_clicks", 0) or 0

        if duration < 10_000:
            score += 3
        elif duration > 300_000:
            score += 3
        if rage + dead > 3:
            score += 2
        if bool(s.get("fingerprint_events")):
            score += 1
        return score

    scored = [(s, _interest_score(s)) for s in session_data]
    scored.sort(key=lambda x: x[1], reverse=True)

    # Tier 1: extreme/interesting sessions (top scores)
    extreme = [s for s, _ in scored[:extreme_budget]]
    used_ids = {id(s) for s in extreme}

    # Tier 3: variant-balanced sample (pull equally from A and B)
    remaining = [(s, sc) for s, sc in scored if id(s) not in used_ids]
    variant_a = [s for s, _ in remaining if (s.get("experiment_variant") or "").lower() == "a"]
    variant_b = [s for s, _ in remaining if (s.get("experiment_variant") or "").lower() == "b"]

    half_variant = max(1, variant_budget // 2)
    random.shuffle(variant_a)
    random.shuffle(variant_b)
    variant_sample = variant_a[:half_variant] + variant_b[:half_variant]
    used_ids.update(id(s) for s in variant_sample)

    # Tier 2: random middle sample from everything remaining
    middle_pool = [s for s, _ in remaining if id(s) not in used_ids]
    random.shuffle(middle_pool)
    middle = middle_pool[:middle_budget]

    selected = extreme + middle + variant_sample

    logger.info(
        "Stratified sample: %d extreme, %d middle, %d variant-balanced (from %d total)",
        len(extreme), len(middle), len(variant_sample), len(session_data),
    )
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

        summary = generate_summary(session_id, api_key, session=session)
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


ENGAGED_STATES = {"engaged", "deliberate", "learning"}
STRUGGLING_STATES = {"confused", "frustrated"}
STATE_RANK = {
    "confused": 0,
    "frustrated": 0,
    "idle": 1,
    "exploring": 2,
    "rushing": 2,
    "learning": 3,
    "deliberate": 4,
    "engaged": 4,
}


def _classify_session_arc(annotations: list[dict]) -> tuple[str, int | None]:
    """Classify a session's learning arc from its fingerprint state sequence.

    Returns (progression_label, onset_index) where onset_index is the
    first fingerprint where the player reaches an engaged state, or None.
    """
    if not annotations:
        return "unknown", None

    states = [a.get("primary_state", "unknown") for a in annotations]
    first_state = states[0]
    last_state = states[-1]

    onset_index = None
    for i, st in enumerate(states):
        if st in ENGAGED_STATES:
            onset_index = i
            break

    first_rank = STATE_RANK.get(first_state, 1)
    last_rank = STATE_RANK.get(last_state, 1)

    if len(states) == 1:
        if first_state in ENGAGED_STATES:
            return "mastered_quickly", 0
        return "no_change", None

    if onset_index == 0 and last_state in ENGAGED_STATES:
        return "mastered_quickly", 0
    elif onset_index is not None and last_state in ENGAGED_STATES:
        return "progressed", onset_index
    elif last_rank > first_rank:
        return "progressed", onset_index
    elif last_rank < first_rank:
        return "regressed", onset_index
    else:
        return "no_change", onset_index


def _learning_velocity_stats(summaries: list[dict]) -> dict:
    """Compute learning velocity from behavioral fingerprint state arcs.

    Uses fingerprint_annotations (per-fingerprint behavioral states) to
    derive how quickly players reach an engaged state and whether their
    understanding improves, stays flat, or regresses within a session.

    Falls back to legacy fields (learning_onset_seconds, etc.) when
    annotations aren't available.
    """
    onset_indices: list[int] = []
    progression_counts: dict[str, int] = {}
    shift_values: list[int] = []

    for s in summaries:
        annotations = s.get("fingerprint_annotations", [])

        if annotations:
            progression, onset_idx = _classify_session_arc(annotations)
            progression_counts[progression] = progression_counts.get(progression, 0) + 1
            if onset_idx is not None:
                onset_indices.append(onset_idx)

            states = [a.get("primary_state", "unknown") for a in annotations]
            first_rank = STATE_RANK.get(states[0], 1)
            last_rank = STATE_RANK.get(states[-1], 1)
            shift_values.append(last_rank - first_rank)
        else:
            # Legacy fallback
            onset = s.get("learning_onset_seconds")
            if isinstance(onset, (int, float)) and onset >= 0:
                onset_indices.append(int(onset))

            prog = s.get("learning_progression", "unknown")
            progression_counts[prog] = progression_counts.get(prog, 0) + 1

    total = sum(progression_counts.values())
    sorted_onsets = sorted(onset_indices)

    improved = sum(1 for v in shift_values if v > 0)
    flat = sum(1 for v in shift_values if v == 0)
    regressed = sum(1 for v in shift_values if v < 0)
    shift_total = len(shift_values)

    return {
        "learning_onset_seconds": {
            "count": len(onset_indices),
            "mean": round(sum(onset_indices) / len(onset_indices), 1) if onset_indices else None,
            "median": sorted_onsets[len(sorted_onsets) // 2] if sorted_onsets else None,
            "p25": sorted_onsets[len(sorted_onsets) // 4] if len(sorted_onsets) >= 4 else None,
            "p75": sorted_onsets[3 * len(sorted_onsets) // 4] if len(sorted_onsets) >= 4 else None,
        },
        "learning_progression_distribution": progression_counts,
        "mastered_quickly_pct": round(
            progression_counts.get("mastered_quickly", 0) / total * 100, 1
        ) if total else 0,
        "understanding_shift": {
            "improved_pct": round(improved / shift_total * 100, 1) if shift_total else 0,
            "flat_pct": round(flat / shift_total * 100, 1) if shift_total else 0,
            "regressed_pct": round(regressed / shift_total * 100, 1) if shift_total else 0,
            "avg_shift": round(sum(shift_values) / shift_total, 2) if shift_total else 0,
        },
    }


def aggregate_summaries(summaries: list[dict]) -> dict:
    """Aggregate individual session summaries into a weekly qualitative report.

    Includes learning velocity metrics: how quickly players learn, what
    percentage progress within a session, and understanding shift distributions.

    Args:
        summaries: List of individual session summary dicts.

    Returns:
        Aggregated report with counts, distributions, learning velocity,
        and top issues.
    """
    if not summaries:
        return {"total_summarized": 0}

    learning_stages: dict[str, int] = {}
    engagement_levels: dict[str, int] = {}
    initial_understanding_dist: dict[str, int] = {}
    final_understanding_dist: dict[str, int] = {}
    all_functional_issues: list[str] = []
    all_design_gaps: list[str] = []
    all_frustration_signals: list[str] = []
    understood_count = 0

    for s in summaries:
        stage = s.get("learning_curve_stage", "unknown")
        learning_stages[stage] = learning_stages.get(stage, 0) + 1

        engagement = s.get("engagement_quality", "unknown")
        engagement_levels[engagement] = engagement_levels.get(engagement, 0) + 1

        initial = s.get("initial_understanding", "unknown")
        initial_understanding_dist[initial] = initial_understanding_dist.get(initial, 0) + 1

        final = s.get("final_understanding", "unknown")
        final_understanding_dist[final] = final_understanding_dist.get(final, 0) + 1

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
        "initial_understanding_distribution": initial_understanding_dist,
        "final_understanding_distribution": final_understanding_dist,
        "learning_curve_distribution": learning_stages,
        "engagement_distribution": engagement_levels,
        "learning_velocity": _learning_velocity_stats(summaries),
        "top_functional_issues": top_items(all_functional_issues),
        "top_design_gaps": top_items(all_design_gaps),
        "top_frustration_signals": top_items(all_frustration_signals),
        "variant_breakdown": _variant_breakdown(summaries),
    }


def _variant_breakdown(summaries: list[dict]) -> dict:
    """Break down all summary metrics by experiment variant (A vs B)."""
    variants: dict[str, list[dict]] = {}
    for s in summaries:
        v = s.get("experiment_variant", "unknown") or "unknown"
        variants.setdefault(v, []).append(s)

    breakdown = {}
    for variant, vsummaries in variants.items():
        total = len(vsummaries)
        understood = sum(1 for s in vsummaries if s.get("understood_mechanics"))

        engagement_dist: dict[str, int] = {}
        for s in vsummaries:
            eng = s.get("engagement_quality", "unknown")
            engagement_dist[eng] = engagement_dist.get(eng, 0) + 1

        initial_dist: dict[str, int] = {}
        final_dist: dict[str, int] = {}
        for s in vsummaries:
            ini = s.get("initial_understanding", "unknown")
            initial_dist[ini] = initial_dist.get(ini, 0) + 1
            fin = s.get("final_understanding", "unknown")
            final_dist[fin] = final_dist.get(fin, 0) + 1

        breakdown[variant] = {
            "count": total,
            "understood_mechanics_pct": round(understood / total * 100, 1) if total else 0,
            "engagement_distribution": engagement_dist,
            "initial_understanding_distribution": initial_dist,
            "final_understanding_distribution": final_dist,
            "learning_velocity": _learning_velocity_stats(vsummaries),
        }

    return breakdown
