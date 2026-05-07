"""Community Agent — monitors public feedback and surfaces insights to the AI team.

STATUS: Placeholder — not yet wired into the pipeline.

INTEGRATION POINT:
    Runs as a separate event-driven workflow. Feeds summarized community
    feedback into the PM agent's input during the weekly evolution cycle.

TRIGGER:
    Event-driven — GitHub webhooks (new issues, stars, discussions),
    Reddit API polling, social media mention monitoring.
    Aggregated summary available for the weekly pipeline.

WHAT IT DOES:
    1. Monitors for mentions and discussions about the project:
       - GitHub issues and discussions on both repos
       - Reddit threads mentioning the project
       - Social media mentions (X/Twitter, HackerNews, etc.)
    2. Categorizes feedback:
       - Feature requests ("add dark mode", "add a leaderboard")
       - Bug reports ("game freezes on mobile Safari")
       - Sentiment (positive, negative, constructive criticism)
       - Questions about how the project works
    3. Produces a weekly community digest:
       - Top feature requests ranked by frequency
       - Notable bug reports not yet captured by FullStory
       - Sentiment trend (is reception improving or declining?)
    4. This digest is injected into the PM agent's input so experiment
       proposals can be informed by real user voices

INPUTS:
    - GitHub API (issues, discussions, stars count, traffic)
    - Reddit API (search for project mentions)
    - Optional: Twitter/X API, HackerNews Algolia API

OUTPUTS:
    - Dict with keys: feature_requests, bug_reports, sentiment_summary,
      notable_comments, engagement_metrics
    - Saved to `pipeline/community_digest.json` for the PM to consume

CONFIGURATION:
    - GITHUB_TOKEN (already available)
    - REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET (for Reddit monitoring)
    - Optional: TWITTER_BEARER_TOKEN, etc.

GUARDRAILS:
    - Never auto-respond to users on behalf of the project owner
    - Summarize, don't editorialize — present feedback neutrally
    - Respect user privacy — don't include usernames in digests
    - Flag urgent bugs to the human owner immediately (don't wait for weekly)
"""

import logging

logger = logging.getLogger(__name__)


def run(github_repo: str = "davidloesch1/web-game") -> dict:
    """Gather and summarize community feedback.

    Args:
        github_repo: The GitHub repo to monitor for issues/discussions.

    Returns:
        Community digest dict.
    """
    raise NotImplementedError("Community agent is not yet implemented")
