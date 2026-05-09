# Site Config: Minesweeper

## Site Identity

| Field | Value |
|---|---|
| Site ID | `minesweeper` |
| Name | Self-Evolving Minesweeper |
| Description | A browser-based Minesweeper clone that evolves itself through AI-driven A/B experiments |
| Repo | `davidloesch1/web-game` |
| Production URL | `web-game-nine-lake.vercel.app` |
| Deploy Platform | Vercel |
| Tech Stack | HTML / CSS / vanilla JavaScript |

## Session Value Events

| Field | Value | Description |
|---|---|---|
| `bounce_gate_event` | `"Game Started"` | Fires when the player clicks their first cell |
| `completion_event` | `"Game Completed"` | Fires when a player wins or loses a game |
| `completion_cap` | `5` | 5 games completed in one session = max score |
| `active_time_cap_ms` | `300000` | 5 minutes of active time = max score |

## Page Properties

```javascript
FS.setProperties('page', {
  site_id: 'minesweeper',
  page_name: 'Game Board',
  experiment_id: 'minesweeper-v1.2.0',
  experiment_variant: 'control',
  site_version: '1.2.0',
});
```

## Current Version

| Field | Value |
|---|---|
| `site_version` | `1.2.0` |
| `last_experiment_id` | `minesweeper-v1.2.0` |

## Identity Constraints

- The site must remain recognizable as Minesweeper (grid, mines, flags, reveal mechanic)
- The core gameplay loop (click to reveal, flag to mark, clear the board) must be preserved

## Site-Specific Constraints

- No adding sound or music without an explicit user opt-in toggle
- Grid size must remain between 8x8 and 30x30

## Change Scope

| Field | Value |
|---|---|
| Max files per experiment | `1` |
| Max lines changed | `50` |
| Allowed files | `game.js, style.css, index.html` |

## Custom Events

| Event Name | When It Fires | Key Properties |
|---|---|---|
| `Game Started` | Player clicks their first cell | — |
| `Game Completed` | Player wins or loses | `outcome_str`: `"win"` or `"loss"` |
| `Experiment Variant Selected` | On page load, after reading experiment.json | `variant_str`: `"a"` or `"b"`, `week_int`: experiment week |
| `Fingerprint Generated` | Every 15s via encoder.min.js | `dim_0` through `dim_31` (32-D vector) |

## Agent Context

- Players are anonymous — tracked only via FullStory session + behavioral fingerprints
- The 32-dimension fingerprint captures play style, pacing, and interaction patterns
- Session data flows from FullStory to BigQuery for analysis
- All game logic lives in a single `game.js` file — no external frameworks
- The game board is a dynamically generated HTML table
- Experiment branches are deployed as Vercel preview URLs and kept permanently as playable historical archives
