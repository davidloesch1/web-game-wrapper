"""Marketing Agent — generates social content from experiment results.

STATUS: Placeholder — not yet wired into the pipeline.

INTEGRATION POINT:
    Runs at the end of the weekly pipeline (after Stage 6: Publish),
    only when a new experiment is successfully launched or a previous
    experiment has a winner declared.

TRIGGER:
    Weekly, after the evolution pipeline completes successfully.

WHAT IT DOES:
    1. Reads the latest experiment results from experiments.json
    2. Summarizes what the AI team tested, what won, and why
    3. Generates platform-specific social posts:
       - Reddit (long-form, conversational, includes "play both variants" links)
       - X/Twitter (concise, hooks + link)
       - LinkedIn (professional framing, AI/tech angle)
    4. Highlights interesting data points from the Data Scientist's analysis
       (e.g., "Players who saw the smaller grid completed 40% more games")
    5. Outputs drafts to a `pipeline/marketing_drafts/` folder or posts
       directly via platform APIs if credentials are configured

INPUTS:
    - experiments.json (current and past experiments)
    - Data Scientist analysis report (for stats and talking points)
    - Previous marketing posts (to avoid repetition)

OUTPUTS:
    - Dict with keys: reddit_post, twitter_post, linkedin_post
    - Each contains: title, body, hashtags, links

CONFIGURATION:
    - Requires social media API keys if auto-posting:
      REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_REFRESH_TOKEN
      TWITTER_API_KEY, TWITTER_API_SECRET
    - Can run in "draft only" mode without API keys

GUARDRAILS:
    - Never fabricate metrics — only reference data from the analysis
    - Don't reveal the specific experiment details to players (maintain A/B blindness)
    - Keep tone authentic and transparent about the AI-driven nature
    - Human can review drafts before posting (configurable)
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def run(experiment_data: dict, analysis: dict | None = None) -> dict:
    """Generate marketing content from the latest experiment cycle.

    Args:
        experiment_data: Full experiments.json data.
        analysis: Optional Data Scientist analysis report for stats.

    Returns:
        Dict with platform-specific post drafts.
    """
    raise NotImplementedError("Marketing agent is not yet implemented")
