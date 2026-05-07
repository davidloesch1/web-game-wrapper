"""SEO & Content Agent — maintains a public changelog and optimizes discoverability.

STATUS: Placeholder — not yet wired into the pipeline.

INTEGRATION POINT:
    Runs as a separate weekly workflow or as an optional final step in the
    evolution pipeline. Writes to the wrapper site's content directory.

TRIGGER:
    Weekly or bi-weekly, after the evolution pipeline completes.

WHAT IT DOES:
    1. Generates a changelog entry for the latest experiment cycle
       (what was tested, what won, what the game looks like now)
    2. Updates the wrapper site's meta tags:
       - <title>, <meta description>, Open Graph tags
       - Dynamic social preview cards reflecting the current experiment
    3. Writes SEO-optimized descriptions of the project
    4. Maintains a public-facing experiment history page with rich content
       (not just raw JSON, but narrative descriptions)
    5. Could integrate with Google Search Console API to monitor
       impressions, clicks, and keyword rankings

INPUTS:
    - experiments.json (full history)
    - Source of Truth document (for project description context)
    - Previous changelog entries (to maintain consistency)

OUTPUTS:
    - Markdown changelog entry (e.g., `public/changelog/week-N.md`)
    - Updated meta tags for index.html
    - Structured data (JSON-LD) for search engines

CONFIGURATION:
    - SEARCH_CONSOLE_CREDENTIALS (optional, for monitoring)
    - Changelog output directory path

GUARDRAILS:
    - Content must be factual and grounded in experiment data
    - Don't over-optimize — write for humans first, search engines second
    - Maintain a consistent voice across entries
    - Never include internal pipeline details (agent prompts, scores, etc.)
"""

import logging

logger = logging.getLogger(__name__)


def run(experiment_data: dict, previous_entries: list[str] | None = None) -> dict:
    """Generate SEO content and changelog entry.

    Args:
        experiment_data: Full experiments.json data.
        previous_entries: Optional list of past changelog entries.

    Returns:
        Dict with keys: changelog_md, meta_tags, structured_data.
    """
    raise NotImplementedError("SEO/Content agent is not yet implemented")
