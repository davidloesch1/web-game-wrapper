/**
 * Webhook relay: FullStory Activations → GitHub repository_dispatch.
 *
 * 1. Receives error events from FullStory Activations
 * 2. Extracts the session ID from the payload
 * 3. Calls FullStory Generate Context + Generate Summary APIs to enrich
 *    the payload with full session context for the SRE agent
 * 4. Triggers the self-heal.yml workflow via GitHub repository_dispatch
 *
 * Environment variables (set in Vercel):
 *   WEBHOOK_SECRET        — shared secret for authenticating FullStory requests
 *   GAME_REPO_PAT         — GitHub PAT with repo scope for dispatching
 *   FULLSTORY_API_KEY     — FullStory API key for Generate Context / Summary
 *   FULLSTORY_PROFILE_ID  — prompt profile ID for Generate Summary (optional)
 */

const FS_API_BASE = 'https://api.fullstory.com';
const DEFAULT_PROFILE_ID = '2e07d0c0-34b1-441c-96ac-c450915a8f9d';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate the webhook
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers['x-webhook-secret'] || req.headers['authorization'];
    if (provided !== secret && provided !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const body = req.body;
  if (!body) {
    return res.status(400).json({ error: 'Empty payload' });
  }

  // Normalize the basic webhook fields
  const payload = normalizePayload(body);

  // Enrich with FullStory session context if we have a session ID
  const fsApiKey = process.env.FULLSTORY_API_KEY;
  if (payload.session_id && fsApiKey) {
    try {
      const enriched = await enrichFromFullStory(payload.session_id, fsApiKey);
      Object.assign(payload, enriched);
    } catch (err) {
      console.error('FullStory enrichment failed (non-fatal):', err.message);
      payload.enrichment_error = err.message;
    }
  }

  // Construct error_message from available data if not already set
  if (!payload.error_message) {
    payload.error_message = buildErrorMessage(payload);
  }

  if (!payload.error_message) {
    return res.status(400).json({ error: 'Could not determine error details from payload' });
  }

  // Dispatch to GitHub Actions
  const pat = process.env.GAME_REPO_PAT;
  if (!pat) {
    console.error('GAME_REPO_PAT not configured');
    return res.status(500).json({ error: 'GitHub PAT not configured' });
  }

  const repo = 'davidloesch1/web-game-wrapper';
  const dispatchUrl = `https://api.github.com/repos/${repo}/dispatches`;

  try {
    const ghResponse = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json',
        'User-Agent': 'fullstory-webhook-relay',
      },
      body: JSON.stringify({
        event_type: 'fullstory-error',
        client_payload: payload,
      }),
    });

    if (!ghResponse.ok) {
      const text = await ghResponse.text();
      console.error('GitHub dispatch failed:', ghResponse.status, text);
      return res.status(502).json({
        error: 'GitHub dispatch failed',
        status: ghResponse.status,
      });
    }

    return res.status(200).json({
      status: 'dispatched',
      error_type: payload.error_type,
      error_preview: payload.error_message.slice(0, 100),
      enriched: !!payload.session_context,
    });
  } catch (err) {
    console.error('Dispatch error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


/**
 * Call FullStory Generate Context + Generate Summary APIs to get
 * rich session data for the SRE agent.
 */
async function enrichFromFullStory(sessionId, apiKey) {
  const encodedId = encodeURIComponent(sessionId);
  const profileId = process.env.FULLSTORY_PROFILE_ID || DEFAULT_PROFILE_ID;
  const result = {};

  // Generate Context — full event timeline formatted for AI
  try {
    const contextResp = await fetch(
      `${FS_API_BASE}/v2/sessions/${encodedId}/context`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );
    if (contextResp.ok) {
      const contextData = await contextResp.json();
      result.session_context = contextData;
      console.log('Generate Context succeeded for', sessionId);
    } else {
      console.warn('Generate Context returned', contextResp.status, 'for', sessionId);
    }
  } catch (err) {
    console.warn('Generate Context failed:', err.message);
  }

  // Generate Summary — AI narrative of the session
  try {
    const summaryResp = await fetch(
      `${FS_API_BASE}/v2/sessions/${encodedId}/summary?config_profile=${profileId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${apiKey}`,
          'Accept': 'application/json',
        },
      },
    );
    if (summaryResp.ok) {
      const summaryData = await summaryResp.json();
      result.session_summary = summaryData.response || summaryData;
      console.log('Generate Summary succeeded for', sessionId);
    } else {
      console.warn('Generate Summary returned', summaryResp.status, 'for', sessionId);
    }
  } catch (err) {
    console.warn('Generate Summary failed:', err.message);
  }

  return result;
}


/**
 * Normalize the FullStory Activations webhook payload into a standard format.
 */
function normalizePayload(body) {
  const data = body.data || body;
  const event = data.event || {};
  const users = data.users || [];
  const sessions = data.sessions || [];

  // Try to extract session ID from multiple locations
  const sessionId =
    body.session_id ||
    data.session_id ||
    event.session_id ||
    (sessions[0] && (sessions[0].id || sessions[0].session_id || sessions[0])) ||
    '';

  // Try multiple locations for the error message
  const errorMessage =
    event.error_message ||
    event.message ||
    data.error_message ||
    data.message ||
    body.error_message ||
    body.message ||
    '';

  // Determine error type from the activation trigger or event type
  const eventType = (body.event_type || data.event_type || event.type || '').toLowerCase();
  const triggerType = (body.trigger || data.trigger || '').toLowerCase();
  const combined = `${eventType} ${triggerType}`;

  let errorType = 'console_error';
  if (combined.includes('network') || combined.includes('request') || combined.includes('fetch')) {
    errorType = 'network_error';
  } else if (combined.includes('exception') || combined.includes('crash') || combined.includes('uncaught')) {
    errorType = 'uncaught_exception';
  }

  return {
    session_id: typeof sessionId === 'string' ? sessionId : String(sessionId),
    error_message: errorMessage,
    error_type: errorType,
    stack_trace: event.stack_trace || event.stackTrace || data.stack_trace || body.stack_trace || '',
    url: body.url || body.app_url_event || data.url || event.url || '',
    source_type: body.source_type || data.source_type || '',
    user_count: users.length || data.user_count || body.user_count || 0,
    session_count: sessions.length || data.session_count || body.session_count || 1,
    console_errors: data.console_errors || [],
    network_errors: data.network_errors || [],
    session_ids: sessions.map(s => s.id || s.session_id || s).filter(Boolean),
    raw_payload: body,
    received_at: new Date().toISOString(),
  };
}


/**
 * Build an error_message from available payload data when no explicit
 * message is provided (common with FullStory network error activations).
 */
function buildErrorMessage(payload) {
  const parts = [];

  // Use summary narrative if available
  if (payload.session_summary?.session_narrative) {
    return payload.session_summary.session_narrative;
  }

  // Use summary frustration signals or design gaps
  if (payload.session_summary?.frustration_signals?.length) {
    return `Frustration detected: ${payload.session_summary.frustration_signals.join('; ')}`;
  }

  if (payload.error_type) {
    parts.push(payload.error_type.replace(/_/g, ' '));
  }

  if (payload.url) {
    parts.push(`on ${payload.url}`);
  }

  if (payload.session_id) {
    parts.push(`(session: ${payload.session_id.slice(0, 20)}...)`);
  }

  return parts.length > 0
    ? parts.join(' ')
    : '';
}
