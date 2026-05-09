# Source of Truth

This document is the highest-order directive for all managed web experiences.
Every experiment, pipeline action, and agent decision must align with the goal
and respect the constraints below. Only the human site owner should edit this file.

Site-specific configuration lives in `pipeline/sites/<site-name>.md`.

## Highest-Order Goal

Maximize average session value across all managed web experiences.

## Session Value Score

Session value is a weighted composite of universal engagement signals.
Only sessions where the user actively engages count — each site defines a
**bounce gate event** that must fire for the session to be included.
Sessions without the bounce gate event are treated as bounces and excluded.

### Formula

```
Session Value = (active_time_normalized * 0.40)
              + (task_completion_normalized * 0.25)
              + (is_return_visitor * 0.20)
              + (frustration_free_score * 0.10)
              + (load_speed_score * 0.05)
```

### Factor Definitions

| Factor | Weight | How to measure | Normalization |
|---|---|---|---|
| Active time after bounce gate | 40% | `active_duration_millis` from FullStory, starting from the site's `bounce_gate_event` | Divide by site's `active_time_cap_ms`, clamp to 0–1 |
| Task completions per session | 25% | Count of the site's `completion_event` custom events in session | Divide by site's `completion_cap`, clamp to 0–1 |
| Return visitor (within 7 days) | 20% | Same `user_id` seen in a previous 7-day window | 1 if returning, 0 if new |
| Frustration-free score | 10% | Inverse of rage clicks + dead clicks per session | `1 - (rage + dead clicks) / 20`, clamp to 0–1 |
| Load speed score | 5% | `load_time_millis` from FullStory loads table | `1 - (load_time / 3000)`, clamp to 0–1 |

The site-specific values (`bounce_gate_event`, `completion_event`,
`active_time_cap_ms`, `completion_cap`) are defined in each site's config file.

### Success Criteria

- Primary metric: average session value (0–1 scale)
- Minimum detectable effect for an experiment to "win": 5% improvement
- The Data Scientist agent computes session value using this formula — the
  weights are not adjustable by the AI team

## Required Page Properties

Every managed site MUST set the following FullStory page properties on every
page load. These enable cross-site filtering, experiment tracking, and
warehouse queries.

| Property | Type | Description |
|---|---|---|
| `site_id` | string | Unique identifier for this site (matches the site config filename, e.g. `"minesweeper"`) |
| `page_name` | string | Human-readable name of the current page or view (e.g. `"Game Board"`, `"Settings"`, `"Home"`) |
| `experiment_id` | string | Current experiment identifier in semver format: `"{site_id}-v{major}.{minor}.{patch}"` (e.g. `"minesweeper-v1.3.0"`) |
| `experiment_variant` | string | `"control"` for the main/production branch, `"challenger"` for the experiment branch |
| `site_version` | string | Full semver version of the site code: `"{major}.{minor}.{patch}"` |

### Versioning Rules

- **Major** (`v2.0.0`): A fundamental change to the site experience.
  Incremented manually by the site owner.
- **Minor** (`v1.3.0`): Each new experiment increments the minor version.
  When a challenger wins and is promoted, main adopts that minor version.
- **Patch** (`v1.3.1`): Hotfixes and SRE self-healing changes.
- The pipeline manages minor and patch bumps automatically. The site owner
  manages major bumps.
- `experiment_id` is always `"{site_id}-v{site_version}"` — this ties the
  experiment to a specific code version, not an arbitrary week number.

### Why This Matters

- `site_id` enables cross-site warehouse queries and per-site dashboard filtering
- `page_name` enables page-level analytics without relying on URL structure
- `experiment_id` with semver replaces week-based numbering — experiments are
  traceable to exact code versions across any site
- `experiment_variant` distinguishes control from challenger in a site-agnostic way

## Universal Constraints

These apply to ALL managed sites. Site-specific constraints are additive and
defined in each site's config file.

- No dark patterns: no fake urgency, deceptive UI, forced waits, or addiction mechanics
- Accessibility must not regress (color contrast, keyboard navigation, screen reader support)
- Page load time must stay under 3 seconds on 3G connections
- No experiments that require user accounts, logins, or collection of personal data
- No experiments that introduce monetization, ads, or paywalls
- No experiments that break mobile responsiveness

## Change Scope Limits

Each experiment is limited in the amount of change it can introduce:

- **Maximum files modified** per experiment: defined in site config (default 1)
- **Maximum lines changed** (added + modified + removed): defined in site config (default 50)
- Changes are categorized by risk level:
  - **Config changes** (colors, sizes, timing values): always allowed
  - **UI additions** (new element, button, display): allowed, one per experiment
  - **Mechanic changes** (how the core experience works): allowed, must pass Ethics
  - **Structural changes** (new files, new dependencies): requires an exception request

## Exception Requests

The AI team may encounter situations where a constraint blocks a promising
experiment. Rather than silently giving up, the PM agent may file an
**exception request**.

### How it works

- The PM writes a request to `pipeline/exception_requests.json` explaining:
  which constraint, why it should be relaxed, the proposed experiment, and
  the expected benefit
- The request is committed and pushed alongside weekly results
- **The pipeline does not block** — it continues with a compliant experiment
  or skips the cycle
- The human owner reviews the queue at their discretion
- If approved, the owner updates this document or the site config to relax
  the constraint
- The AI team can then use the relaxed constraint in the following cycle

### Exception requests are NOT

- A way to bypass constraints automatically
- A blocker to the pipeline
- Binding on the human owner in any way

## Guardrails

- If both variants perform worse than the current baseline, keep the current version
- Maximum one experiment per cycle per site — no stacking or compound changes
- Each experiment should test a single, isolated variable
- The site must remain fully functional in both variants at all times
- Minimum 100 sessions per variant before declaring a winner

## Behavioral Intelligence Standards

All managed sites share a common behavioral intelligence layer:

- **Fingerprint encoder**: The site-agnostic TensorFlow.js GRU encoder
  (`encoder.min.js`) must be included on every managed site. It processes
  raw DOM events into 32-dimensional embedding vectors.
- **FullStory behavioral profile**: All sites use the shared behavioral
  profile (`d904a09b-80d2-4d38-81bf-6784a500da6a`) for session summaries,
  producing structured archetype/intent/state annotations.
- **Shared warehouse**: All session data flows to the same BigQuery dataset,
  tagged by `site_id`. Cross-site analysis is a first-class capability.
- **Dashboard**: The wrapper dashboard supports multi-site visualization.
  Each site's data is filterable by `site_id`.

## Roadmap & Design Notes

### Dashboard Modularity (Priority)

The dashboard tiles should be refactored into a modular, composable widget
system driven by a config manifest, so each site can declare which widgets
to render, their data bindings, and layout positions.

### Multi-Site Behavioral Intelligence

Scaling to multiple sites with standardized data in a shared warehouse will
increase the diversity of behavioral patterns, improving archetype
classification and intent prediction. Design decisions should favor shared
schemas and site-tagged data over site-specific pipelines.
