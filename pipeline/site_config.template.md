# Site Config: {{SITE_NAME}}

<!-- Copy this file to pipeline/sites/<site-id>.md and fill in all sections. -->
<!-- The filename (without .md) becomes the site_id used in page properties. -->

## Site Identity

| Field | Value |
|---|---|
| Site ID | `{{site_id}}` |
| Name | {{Human-readable site name}} |
| Description | {{One sentence describing the site}} |
| Repo | `{{github_org}}/{{repo_name}}` |
| Production URL | `{{production-host.vercel.app}}` |
| Deploy Platform | {{Vercel / Netlify / other}} |
| Tech Stack | {{e.g. HTML/CSS/JS, React, Vue, etc.}} |

## Session Value Events

These values plug into the universal session value formula defined in
`source_of_truth.md`.

| Field | Value | Description |
|---|---|---|
| `bounce_gate_event` | `"{{Event Name}}"` | Custom event that must fire for a session to count (not a bounce) |
| `completion_event` | `"{{Event Name}}"` | Custom event that represents the user completing the site's primary task |
| `completion_cap` | `{{integer}}` | Maximum completions for normalization (divide by this, clamp to 0–1) |
| `active_time_cap_ms` | `{{integer}}` | Maximum active time in ms for normalization (e.g. 300000 for 5 min) |

## Page Properties

Every page on this site MUST set these FullStory page properties on load.
See `source_of_truth.md` for the full specification.

```javascript
// Example implementation — adapt to your framework
FS.setProperties('page', {
  site_id: '{{site_id}}',
  page_name: '{{page_name}}',          // e.g. 'Home', 'Game Board', 'Settings'
  experiment_id: '{{site_id}}-v1.0.0', // updated by pipeline per experiment
  experiment_variant: 'control',        // 'control' on main, 'challenger' on experiment branches
  site_version: '1.0.0',               // current semver of the site
});
```

## Current Version

| Field | Value |
|---|---|
| `site_version` | `1.0.0` |
| `last_experiment_id` | `{{site_id}}-v1.0.0` |

The pipeline updates these values automatically when experiments are
created, promoted, or patched.

## Identity Constraints

What this site must ALWAYS remain — experiments cannot violate these.

- {{e.g. "Must remain recognizable as a word-guessing game"}}
- {{e.g. "Core mechanic of 5-letter words with 6 attempts must be preserved"}}

## Site-Specific Constraints

Additional rules beyond the universal constraints in `source_of_truth.md`.

- {{e.g. "No adding sound or music without an explicit user opt-in toggle"}}
- {{e.g. "Dictionary must remain standard English"}}

## Change Scope

| Field | Value |
|---|---|
| Max files per experiment | `1` |
| Max lines changed | `50` |
| Allowed files | `{{e.g. game.js, style.css, index.html}}` |

## Custom Events

List all custom events this site fires (beyond the required bounce gate
and completion events). These inform the Data Scientist's analysis.

| Event Name | When It Fires | Key Properties |
|---|---|---|
| `{{Event Name}}` | {{Description}} | {{e.g. outcome_str: "win" / "loss"}} |
| `Fingerprint Generated` | Every 15s via encoder.min.js | `dim_0` through `dim_31` (32-D vector) |

## Agent Context

Additional context that agents need when working on this site.

- {{e.g. "Players are anonymous — tracked only via FullStory session + behavioral fingerprints"}}
- {{e.g. "The game board is rendered in a single canvas element"}}
- {{e.g. "All game logic lives in game.js — no external frameworks"}}
