"""Backfill dashboard data — pull all sessions and generate AI summaries.

Produces a single JSON file (public/data/dashboard.json) containing:
  - All enriched session records from BigQuery
  - AI-generated session summaries from FullStory
  - Aggregated qualitative report with learning velocity stats
  - 2D projections of fingerprint vectors for scatter visualization

Designed to run as a GitHub Action (backfill-dashboard.yml) or locally
with BIGQUERY_CREDENTIALS and FULLSTORY_API_KEY set.
"""

import json
import logging
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("backfill")

REPO_ROOT = Path(__file__).parent.parent
DASHBOARD_JSON = REPO_ROOT / "public" / "data" / "dashboard.json"
EXPERIMENTS_JSON = REPO_ROOT / "public" / "data" / "experiments.json"

BQ_PROJECT = os.environ.get("BQ_PROJECT", "minesweeper-495519")
BQ_DATASET = os.environ.get("BQ_DATASET", "fs_data_destination")


def _get_bq_client():
    creds_json = os.environ.get("BIGQUERY_CREDENTIALS")
    if not creds_json:
        logger.error("BIGQUERY_CREDENTIALS not set")
        return None

    creds_path = Path("/tmp/bq-credentials.json")
    creds_path.write_text(creds_json)
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(creds_path)

    from google.cloud import bigquery
    return bigquery.Client(project=BQ_PROJECT)


def _bq_table(name: str) -> str:
    return f"`{BQ_PROJECT}.{BQ_DATASET}.{name}`"


def pull_all_sessions() -> list[dict]:
    """Pull all game sessions from BigQuery with fingerprints and events."""
    client = _get_bq_client()
    if not client:
        return []

    from google.cloud import bigquery

    logger.info("Pulling all sessions from BigQuery...")

    session_query = f"""
    SELECT
      pv.session_id,
      pv.user_id,
      pv.view_id,
      pv.event_time,
      pv.duration_millis,
      pv.active_duration_millis,
      pv.inactive_duration_millis,
      pv.max_scroll_depth,
      sp.url_host,
      sp.user_agent_browser,
      sp.user_agent_device,
      sp.user_agent_operating_system,
      sp.location_country,
      sp.location_region
    FROM {_bq_table('page_views')} pv
    LEFT JOIN {_bq_table('source_properties')} sp
      ON pv.event_id = sp.event_id
    WHERE pv.event_time >= TIMESTAMP('2026-05-01')
    ORDER BY pv.event_time
    """

    clicks_query = f"""
    SELECT
      c.session_id,
      COUNT(*) AS total_clicks,
      SUM(c.fs_rage_count) AS total_rage_clicks,
      SUM(c.fs_dead_count) AS total_dead_clicks
    FROM {_bq_table('clicks')} c
    WHERE c.event_time >= TIMESTAMP('2026-05-01')
    GROUP BY c.session_id
    """

    fingerprint_query = f"""
    SELECT
      ce.session_id,
      ce.user_id,
      ce.event_name,
      ce.event_properties,
      ce.event_time
    FROM {_bq_table('custom_events')} ce
    WHERE ce.event_time >= TIMESTAMP('2026-05-01')
    ORDER BY ce.event_time
    """

    # Variant assignment from page properties (if available).
    # FullStory exports page properties with type suffixes (_str, _int),
    # so we try both naming conventions.
    variant_queries = [
        f"""
        SELECT DISTINCT
          pv.session_id,
          pp.experiment_week_int AS experiment_week,
          pp.experiment_variant_str AS experiment_variant
        FROM {_bq_table('page_views')} pv
        INNER JOIN {_bq_table('page_properties')} pp
          ON pv.event_id = pp.event_id
        WHERE pv.event_time >= TIMESTAMP('2026-05-01')
          AND pp.experiment_week_int IS NOT NULL
        """,
        f"""
        SELECT DISTINCT
          pv.session_id,
          pp.experiment_week AS experiment_week,
          pp.experiment_variant AS experiment_variant
        FROM {_bq_table('page_views')} pv
        INNER JOIN {_bq_table('page_properties')} pp
          ON pv.event_id = pp.event_id
        WHERE pv.event_time >= TIMESTAMP('2026-05-01')
          AND pp.experiment_week IS NOT NULL
        """,
    ]

    sessions_raw = [dict(row) for row in client.query(session_query)]
    logger.info("Found %d page view records", len(sessions_raw))

    clicks = {
        row["session_id"]: dict(row)
        for row in client.query(clicks_query)
    }
    logger.info("Found click data for %d sessions", len(clicks))

    fingerprints_raw = [dict(row) for row in client.query(fingerprint_query)]
    logger.info("Found %d custom event records", len(fingerprints_raw))

    fingerprints_by_session: dict[str, list[dict]] = {}
    for fp in fingerprints_raw:
        sid = fp.get("session_id")
        if sid:
            fingerprints_by_session.setdefault(sid, []).append(fp)

    variants_by_session: dict[str, dict] = {}
    for vq in variant_queries:
        try:
            for row in client.query(vq):
                r = dict(row)
                sid = r.get("session_id")
                if sid and sid not in variants_by_session:
                    variants_by_session[sid] = r
            if variants_by_session:
                logger.info("Found variant data for %d sessions via page_properties", len(variants_by_session))
                break
        except Exception as e:
            logger.debug("Variant query attempt failed (trying next): %s", e)

    if not variants_by_session:
        logger.warning("No variant data from page_properties — will fall back to URL-based assignment")

    # Build URL-to-variant mapping from experiments.json for fallback
    url_variant_map: dict[str, tuple[str, int]] = {}
    if EXPERIMENTS_JSON.exists():
        with open(EXPERIMENTS_JSON) as f:
            exp_data = json.load(f)
        for exp in exp_data.get("experiments", []):
            week = exp.get("week", 0)
            for url_key, variant in [("variantAUrl", "a"), ("variantBUrl", "b")]:
                url = exp.get(url_key, "")
                if url:
                    from urllib.parse import urlparse
                    host = urlparse(url).netloc
                    if host:
                        url_variant_map[host] = (variant, week)

    enriched = []
    seen_sessions: set[str] = set()
    for session in sessions_raw:
        sid = session.get("session_id")
        if not sid or sid in seen_sessions:
            continue
        seen_sessions.add(sid)

        click_data = clicks.get(sid, {})
        session["total_clicks"] = click_data.get("total_clicks", 0)
        session["total_rage_clicks"] = click_data.get("total_rage_clicks", 0)
        session["total_dead_clicks"] = click_data.get("total_dead_clicks", 0)
        session["fingerprint_events"] = fingerprints_by_session.get(sid, [])

        variant_data = variants_by_session.get(sid, {})
        session["experiment_week"] = variant_data.get("experiment_week")
        session["experiment_variant"] = variant_data.get("experiment_variant")

        # URL-based fallback: if no page property data, derive from url_host
        if not session["experiment_variant"] and session.get("url_host"):
            url_match = url_variant_map.get(session["url_host"])
            if url_match:
                session["experiment_variant"] = url_match[0]
                session["experiment_week"] = session["experiment_week"] or url_match[1]

        enriched.append(session)

    logger.info("Assembled %d unique enriched sessions", len(enriched))
    return enriched


def _parse_fingerprint_vec(props: dict | str) -> list[float] | None:
    """Extract a 32-D vector from fingerprint event properties."""
    if isinstance(props, str):
        try:
            props = json.loads(props)
        except (json.JSONDecodeError, TypeError):
            return None

    vec: list[float] = []
    for dim in range(32):
        for key_pattern in [f"dim_{dim}", f"d{dim}", f"dimension_{dim}"]:
            if key_pattern in props:
                try:
                    vec.append(float(props[key_pattern]))
                except (ValueError, TypeError):
                    vec.append(0.0)
                break
        else:
            val = props.get(f"dim_{dim}_real", 0.0)
            try:
                vec.append(float(val))
            except (ValueError, TypeError):
                vec.append(0.0)

    return vec if len(vec) == 32 else None


def _compute_state_centroids(
    sessions: list[dict],
    summary_by_session: dict[str, dict],
) -> dict:
    """Compute mean fingerprint vectors per behavioral state.

    Pairs raw 32-dim fingerprint vectors with AI-generated state labels
    from fingerprint_annotations. Each annotation covers a time window;
    vectors are assigned to the nearest annotation by index proportion.

    Returns a dict with centroids, per-state counts, and metadata for
    client-side classification.
    """
    from datetime import datetime as _dt

    state_vectors: dict[str, list[list[float]]] = {}

    for session in sessions:
        sid = session.get("session_id")
        summary = summary_by_session.get(sid, {}) if sid else {}
        annotations = summary.get("fingerprint_annotations", [])
        if not annotations:
            continue

        fps = [
            e for e in session.get("fingerprint_events", [])
            if e.get("event_name") == "Fingerprint Generated"
        ]
        if not fps:
            continue

        vectors = []
        for fp in fps:
            vec = _parse_fingerprint_vec(fp.get("event_properties", {}))
            if vec is not None:
                vectors.append(vec)

        if not vectors:
            continue

        n_vecs = len(vectors)
        n_anns = len(annotations)

        for vec_idx, vec in enumerate(vectors):
            ann_idx = min(int(vec_idx / n_vecs * n_anns), n_anns - 1)
            state = annotations[ann_idx].get("primary_state", "unknown")
            if state == "unknown":
                continue
            state_vectors.setdefault(state, []).append(vec)

    centroids: dict[str, list[float]] = {}
    counts: dict[str, int] = {}

    for state, vecs in state_vectors.items():
        n = len(vecs)
        counts[state] = n
        centroid = [0.0] * 32
        for v in vecs:
            for d in range(32):
                centroid[d] += v[d]
        centroids[state] = [round(c / n, 6) for c in centroid]

    total = sum(counts.values())
    logger.info(
        "Centroid states: %s (total vectors: %d)",
        {s: counts[s] for s in sorted(counts)},
        total,
    )

    return {
        "generated_at": _dt.now().isoformat(),
        "total_vectors": total,
        "counts": counts,
        "centroids": centroids,
    }


def project_fingerprints_2d(sessions: list[dict]) -> dict:
    """Project 32-D fingerprint vectors to 2D for scatter visualization.

    Returns a dict with two keys:
      - "fingerprint_projections": one dot per fingerprint snapshot across all
        sessions (includes fingerprint_index and event_time for each).
      - "session_projections": one dot per session, computed as the centroid
        (mean) of all fingerprint vectors within that session, projected onto
        the same PCA axes.
    """
    vectors: list[list[float]] = []
    session_indices: list[int] = []
    fp_indices: list[int] = []
    fp_times: list[str] = []

    for i, session in enumerate(sessions):
        fps = session.get("fingerprint_events", [])
        if not fps:
            continue
        for fp_idx, fp in enumerate(fps):
            vec = _parse_fingerprint_vec(fp.get("event_properties", {}))
            if vec is not None:
                vectors.append(vec)
                session_indices.append(i)
                fp_indices.append(fp_idx)
                fp_times.append(str(fp.get("event_time", "")))

    if not vectors:
        logger.info("No fingerprint vectors found — skipping 2D projection")
        return {"fingerprint_projections": [], "session_projections": []}

    logger.info("Projecting %d fingerprint vectors to 2D", len(vectors))

    n = len(vectors)
    d = 32

    mean = [0.0] * d
    for v in vectors:
        for j in range(d):
            mean[j] += v[j]
    mean = [m / n for m in mean]

    centered = [[v[j] - mean[j] for j in range(d)] for v in vectors]

    def _dot(a: list[float], b: list[float]) -> float:
        return sum(x * y for x, y in zip(a, b))

    def _norm(a: list[float]) -> float:
        return math.sqrt(sum(x * x for x in a))

    def _subtract_projection(a: list[float], b: list[float]) -> list[float]:
        proj = _dot(a, b) / max(_dot(b, b), 1e-10)
        return [a[j] - proj * b[j] for j in range(len(a))]

    def _power_iteration(data: list[list[float]], num_iters: int = 50) -> list[float]:
        import random
        random.seed(42)
        w = [random.gauss(0, 1) for _ in range(d)]
        norm_w = _norm(w)
        w = [x / max(norm_w, 1e-10) for x in w]
        for _ in range(num_iters):
            new_w = [0.0] * d
            for row in data:
                coeff = _dot(row, w)
                for j in range(d):
                    new_w[j] += coeff * row[j]
            norm_new = _norm(new_w)
            w = [x / max(norm_new, 1e-10) for x in new_w]
        return w

    pc1 = _power_iteration(centered)
    deflected = [_subtract_projection(row, pc1) for row in centered]
    pc2 = _power_iteration(deflected)

    # --- Fingerprint-level projections (one dot per fingerprint snapshot) ---
    fingerprint_projections = []
    for idx, vec in enumerate(centered):
        x = _dot(vec, pc1)
        y = _dot(vec, pc2)
        si = session_indices[idx]
        session = sessions[si]
        fingerprint_projections.append({
            "session_id": session.get("session_id"),
            "x": round(x, 4),
            "y": round(y, 4),
            "event_time": fp_times[idx],
            "fingerprint_index": fp_indices[idx],
            "experiment_variant": session.get("experiment_variant"),
            "experiment_week": session.get("experiment_week"),
        })

    # --- Session-level projections (centroid of each session's fingerprints) ---
    from collections import defaultdict
    session_vecs: dict[int, list[list[float]]] = defaultdict(list)
    for idx, vec in enumerate(vectors):
        session_vecs[session_indices[idx]].append(vec)

    session_projections = []
    for si, vecs in session_vecs.items():
        centroid = [0.0] * d
        for v in vecs:
            for j in range(d):
                centroid[j] += v[j]
        centroid = [c / len(vecs) for c in centroid]
        centroid_centered = [centroid[j] - mean[j] for j in range(d)]
        x = _dot(centroid_centered, pc1)
        y = _dot(centroid_centered, pc2)
        session = sessions[si]
        session_projections.append({
            "session_id": session.get("session_id"),
            "x": round(x, 4),
            "y": round(y, 4),
            "fingerprint_count": len(vecs),
            "experiment_variant": session.get("experiment_variant"),
            "experiment_week": session.get("experiment_week"),
        })

    logger.info(
        "  Fingerprint dots: %d | Session centroids: %d",
        len(fingerprint_projections), len(session_projections),
    )
    return {
        "fingerprint_projections": fingerprint_projections,
        "session_projections": session_projections,
    }


def _serialize_session(session: dict) -> dict:
    """Convert a session dict to JSON-serializable format."""
    result = {}
    for k, v in session.items():
        if k == "fingerprint_events":
            serialized_fps = []
            for fp in v:
                sfp = {}
                for fk, fv in fp.items():
                    if isinstance(fv, datetime):
                        sfp[fk] = fv.isoformat()
                    else:
                        sfp[fk] = fv
                serialized_fps.append(sfp)
            result[k] = serialized_fps
        elif isinstance(v, datetime):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result


def _aggregate_behavioral_profiles(summaries: list[dict]) -> dict:
    """Aggregate behavioral intelligence data from the new profile format.

    Produces distributions for archetypes, intents, dominant states,
    value predictions, and per-fingerprint state frequencies.
    """
    archetype_counts: dict[str, int] = {}
    intent_counts: dict[str, int] = {}
    dominant_state_counts: dict[str, int] = {}
    state_counts: dict[str, int] = {}
    value_scores: list[float] = []
    will_return_count = 0
    intent_fulfilled_count = 0
    total_with_profile = 0

    for s in summaries:
        archetype = s.get("archetype")
        if not isinstance(archetype, dict):
            continue
        total_with_profile += 1

        a_primary = archetype.get("primary", "unknown")
        archetype_counts[a_primary] = archetype_counts.get(a_primary, 0) + 1

        intent = s.get("intent", {})
        if isinstance(intent, dict):
            i_primary = intent.get("primary", "unknown")
            intent_counts[i_primary] = intent_counts.get(i_primary, 0) + 1
            if intent.get("fulfilled"):
                intent_fulfilled_count += 1

        ds = s.get("dominant_state", "unknown")
        dominant_state_counts[ds] = dominant_state_counts.get(ds, 0) + 1

        vp = s.get("value_prediction", {})
        if isinstance(vp, dict):
            score = vp.get("score")
            if isinstance(score, (int, float)):
                value_scores.append(score)
            if vp.get("will_return"):
                will_return_count += 1

        for ann in s.get("fingerprint_annotations", []):
            ps = ann.get("primary_state", "unknown")
            state_counts[ps] = state_counts.get(ps, 0) + 1

    if not total_with_profile:
        return {"total_profiled": 0}

    return {
        "total_profiled": total_with_profile,
        "archetype_distribution": archetype_counts,
        "intent_distribution": intent_counts,
        "intent_fulfilled_pct": round(intent_fulfilled_count / total_with_profile * 100, 1),
        "dominant_state_distribution": dominant_state_counts,
        "fingerprint_state_distribution": state_counts,
        "value_prediction": {
            "mean_score": round(sum(value_scores) / len(value_scores), 3) if value_scores else None,
            "will_return_pct": round(will_return_count / total_with_profile * 100, 1),
        },
    }


def main():
    logger.info("=== Dashboard Data Backfill ===")

    # Pull all sessions from BigQuery
    sessions = pull_all_sessions()
    if not sessions:
        logger.error("No sessions found — cannot generate dashboard data")
        sys.exit(1)

    # Generate AI summaries via FullStory
    from agents.session_summarizer import (
        run as summarize_sessions,
        aggregate_summaries,
    )

    logger.info("--- Generating AI session summaries ---")
    session_summaries = []
    qualitative_report = {"total_summarized": 0}
    try:
        session_summaries = summarize_sessions(sessions)
        qualitative_report = aggregate_summaries(session_summaries)
        logger.info(
            "Generated %d summaries, %s%% understood mechanics",
            qualitative_report.get("total_summarized", 0),
            qualitative_report.get("understood_mechanics_pct", "N/A"),
        )
    except Exception as e:
        logger.error("Summary generation failed (non-fatal): %s", e, exc_info=True)

    # Build summary lookup by session_id
    summary_by_session: dict[str, dict] = {}
    for s in session_summaries:
        sid = s.get("session_id")
        if sid:
            summary_by_session[sid] = s

    # Compute behavioral intelligence aggregates
    behavioral_summary = _aggregate_behavioral_profiles(session_summaries)

    # Compute 2D projections for fingerprint scatter
    logger.info("--- Computing 2D fingerprint projections ---")
    projection_result = project_fingerprints_2d(sessions)
    fingerprint_projections = projection_result["fingerprint_projections"]
    session_projections = projection_result["session_projections"]

    # Attach summaries and projections to session data
    projection_by_session: dict[str, dict] = {}
    for p in session_projections:
        sid = p.get("session_id")
        if sid and sid not in projection_by_session:
            projection_by_session[sid] = p

    sessions_for_dashboard = []
    for session in sessions:
        sid = session.get("session_id")
        entry = _serialize_session(session)
        entry["summary"] = summary_by_session.get(sid)
        entry["projection"] = projection_by_session.get(sid)
        sessions_for_dashboard.append(entry)

    # Compute behavioral state centroids from fingerprint vectors + AI labels
    logger.info("--- Computing behavioral state centroids ---")
    state_centroids = _compute_state_centroids(sessions, summary_by_session)

    centroids_path = REPO_ROOT / "public" / "data" / "state_centroids.json"
    centroids_path.parent.mkdir(parents=True, exist_ok=True)
    with open(centroids_path, "w") as f:
        json.dump(state_centroids, f, indent=2)
        f.write("\n")
    logger.info(
        "State centroids written to %s (%d states, %d total vectors)",
        centroids_path,
        len(state_centroids.get("centroids", {})),
        state_centroids.get("total_vectors", 0),
    )

    # Load experiment data
    experiments = {}
    if EXPERIMENTS_JSON.exists():
        with open(EXPERIMENTS_JSON) as f:
            experiments = json.load(f)

    # Assemble final dashboard data
    dashboard_data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_sessions": len(sessions_for_dashboard),
        "total_summarized": qualitative_report.get("total_summarized", 0),
        "qualitative_report": qualitative_report,
        "behavioral_summary": behavioral_summary,
        "experiments": experiments.get("experiments", []),
        "goal": experiments.get("goal", ""),
        "current_week": experiments.get("currentWeek", 1),
        "sessions": sessions_for_dashboard,
        "projections": fingerprint_projections,
        "session_projections": session_projections,
    }

    # Write to public/data/dashboard.json
    DASHBOARD_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(DASHBOARD_JSON, "w") as f:
        json.dump(dashboard_data, f, indent=2, default=str)
        f.write("\n")

    logger.info("Dashboard data written to %s", DASHBOARD_JSON)
    logger.info(
        "  Sessions: %d | Summaries: %d | Projections: %d",
        len(sessions_for_dashboard),
        len(session_summaries),
        len(fingerprint_projections),
    )
    logger.info("  Session centroids: %d", len(session_projections))
    logger.info("=== Backfill complete ===")


if __name__ == "__main__":
    main()
