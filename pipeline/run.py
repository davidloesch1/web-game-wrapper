from google.cloud import bigquery

def pull_weekly_data(week_start, week_end):
    client = bigquery.Client()
    query = """
    SELECT
      session_id,
      device_id,
      session_duration_seconds,
      page_url,
      -- fingerprint dimensions from custom events
      custom_event.fingerprint_json,
      -- session-level summaries
      total_events,
      pages_visited
    FROM `your_project.fullstory.sessions`
    WHERE session_start BETWEEN @start AND @end
      AND page_url LIKE '%web-game-nine-lake%'  -- game sessions only, not wrapper
    """
    # ... execute and return as list of dicts
