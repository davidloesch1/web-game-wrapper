/**
 * Webhook relay: FullStory Activations → GitHub repository_dispatch.
 *
 * FullStory sends error events here. This function validates the request,
 * normalizes the payload, and triggers the self-heal.yml workflow via
 * GitHub's repository_dispatch API.
 *
 * Environment variables (set in Vercel):
 *   WEBHOOK_SECRET     — shared secret for authenticating FullStory requests
 *   GAME_REPO_PAT      — GitHub PAT with repo scope for dispatching
 */

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

  // Normalize FullStory Activations payload into our standard format
  const errorPayload = normalizePayload(body);

  if (!errorPayload.error_message) {
    return res.status(400).json({ error: 'No error_message found in payload' });
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
        client_payload: errorPayload,
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
      severity: errorPayload.error_type,
      error_preview: errorPayload.error_message.slice(0, 100),
    });
  } catch (err) {
    console.error('Dispatch error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


/**
 * Normalize a FullStory Activations webhook payload into the format
 * expected by the SRE agent.
 *
 * FullStory Activations can send various event shapes. This function
 * handles the common patterns and extracts what we need.
 */
function normalizePayload(body) {
  // FullStory Activations payload structure varies by trigger type.
  // Common fields: data.users, data.sessions, data.event
  const data = body.data || body;

  // Extract from FullStory's activation event format
  const event = data.event || {};
  const users = data.users || [];
  const sessions = data.sessions || [];

  // Try multiple locations for the error message
  const errorMessage =
    event.error_message ||
    event.message ||
    data.error_message ||
    data.message ||
    body.error_message ||
    body.message ||
    '';

  // Determine error type from the activation trigger
  const triggerType = (body.trigger || event.type || data.type || '').toLowerCase();
  let errorType = 'console_error';
  if (triggerType.includes('network') || triggerType.includes('request')) {
    errorType = 'network_error';
  } else if (triggerType.includes('exception') || triggerType.includes('crash')) {
    errorType = 'uncaught_exception';
  }

  return {
    error_message: errorMessage,
    error_type: errorType,
    stack_trace: event.stack_trace || event.stackTrace || data.stack_trace || '',
    url: event.url || data.url || '',
    user_count: users.length || data.user_count || body.user_count || 0,
    session_count: sessions.length || data.session_count || body.session_count || 0,
    console_errors: data.console_errors || [],
    network_errors: data.network_errors || [],
    session_ids: sessions.map(s => s.id || s.session_id || s).filter(Boolean),
    raw_trigger: body.trigger || '',
    received_at: new Date().toISOString(),
  };
}
