"""Performance Monitor Agent — tracks page load speed and flags regressions.

STATUS: Placeholder — not yet wired into the pipeline.

INTEGRATION POINT:
    Runs within the weekly pipeline during Stage 1 (data pull) or as a
    separate check. Can also veto experiment proposals if a variant
    degrades performance past the 3-second threshold.

TRIGGER:
    Weekly (alongside the evolution pipeline), or threshold-based if
    wired to real-time monitoring.

WHAT IT DOES:
    1. Pulls load time data from FullStory/BigQuery:
       - `load_time_millis` from the loads table
       - Time-to-interactive estimates from page view durations
       - Network request timing for key assets (game.js, style.css)
    2. Compares performance across:
       - Variant A vs Variant B (is the experiment slowing things down?)
       - This week vs last week (trend detection)
       - Desktop vs mobile (regression on specific device types)
    3. Flags regressions:
       - "Variant B is 800ms slower on mobile"
       - "Average load time increased 25% week-over-week"
    4. Computes the load_speed_score factor for session value:
       load_speed_score = 1 - (load_time / 3000), clamped to 0-1
    5. Can VETO an experiment if either variant exceeds the 3-second
       load time threshold from the Source of Truth
    6. Suggests optimizations if load times are trending up:
       - Image compression opportunities
       - Unused CSS/JS removal
       - Caching header improvements

INPUTS:
    - BigQuery loads table data
    - FullStory page view timing data
    - Current experiment metadata (to compare variants)

OUTPUTS:
    - Dict with keys: load_speed_scores, variant_comparison,
      week_over_week_trend, regression_alerts, optimization_suggestions
    - The load_speed_score feeds into the session value calculation

CONFIGURATION:
    - BQ_PROJECT, BQ_DATASET (already available)
    - PERFORMANCE_THRESHOLD_MS (default: 3000)
    - REGRESSION_ALERT_THRESHOLD_PERCENT (default: 20)

GUARDRAILS:
    - Performance veto requires clear evidence (minimum 50 page loads)
    - Don't veto based on outliers — use median, not mean
    - Mobile and desktop evaluated separately
    - Historical trend requires at least 2 weeks of data
"""

import logging

logger = logging.getLogger(__name__)

PERFORMANCE_THRESHOLD_MS = 3000


def run(
    session_data: list[dict],
    experiment_data: dict,
) -> dict:
    """Analyze performance metrics and flag regressions.

    Args:
        session_data: Enriched session records from BigQuery.
        experiment_data: Current experiments.json data.

    Returns:
        Performance report dict.
    """
    raise NotImplementedError("Performance Monitor agent is not yet implemented")
