# Source of Truth

This document is the highest-order directive for the self-evolving game pipeline.
All experiments must align with the goal and respect the constraints below.
Only the human site owner should edit this file.

## Highest-Order Goal

Maximize average session value for the Minesweeper game.

## Session Value Score

Session value is a weighted composite of multiple engagement signals.
Only sessions where the player actually starts a game count (the "Game Started"
event must fire). Sessions without a game start are treated as bounces and
excluded from analysis.

### Formula

```
Session Value = (active_time_normalized * 0.40)
              + (games_completed_normalized * 0.25)
              + (is_return_visitor * 0.20)
              + (frustration_free_score * 0.10)
              + (load_speed_score * 0.05)
```

### Factor Definitions

| Factor | Weight | How to measure | Normalization |
|---|---|---|---|
| Active time after game start | 40% | `active_duration_millis` from FullStory page_views, starting from "Game Started" event | Divide by 300000 (5 min cap), clamp to 0-1 |
| Games completed per session | 25% | Count of "Game Completed" custom events in session | Divide by 5 (cap), clamp to 0-1 |
| Return visitor (within 7 days) | 20% | Same user_id seen in a previous 7-day window | 1 if returning, 0 if new |
| Frustration-free score | 10% | Inverse of rage clicks + dead clicks per session | 1 - (rage+dead clicks / 20), clamp to 0-1 |
| Load speed score | 5% | `load_time_millis` from FullStory loads table | 1 - (load_time / 3000), clamp to 0-1 |

### Success Criteria

- Primary metric: average session value (0-1 scale)
- Minimum detectable effect for an experiment to "win": 5% improvement in average session value
- The Data Scientist agent computes session value using this formula — the weights are not adjustable by the AI team

## Constraints

- The game must remain recognizable as Minesweeper (grid, mines, flags, reveal mechanic)
- No dark patterns: no fake urgency, deceptive UI, forced waits, or addiction mechanics
- Accessibility must not regress (color contrast, keyboard navigation, screen reader support)
- Page load time must stay under 3 seconds on 3G connections
- No experiments that require user accounts, logins, or collection of personal data
- No experiments that introduce monetization, ads, or paywalls
- No experiments that break mobile responsiveness
- No adding sound or music without an explicit user opt-in toggle

## Change Scope Limits

Each experiment is limited in the amount of change it can introduce:

- **Maximum 1 file modified** per experiment (game.js, style.css, or index.html)
- **Maximum 50 lines changed** (added + modified + removed)
- Changes are categorized by risk level:
  - **Config changes** (colors, sizes, timing values): always allowed
  - **UI additions** (new element, button, display): allowed, one per experiment
  - **Mechanic changes** (how the game plays): allowed, but must pass Ethics with extra scrutiny
  - **Structural changes** (new files, new dependencies): requires an exception request

## Exception Requests

The AI team may encounter situations where a constraint blocks a promising experiment.
Rather than silently giving up, the PM agent may file an **exception request**.

### How it works

- The PM writes a request to `pipeline/exception_requests.json` explaining:
  which constraint, why it should be relaxed, the proposed experiment, and the expected benefit
- The request is committed and pushed alongside weekly results
- **The pipeline does not block** — it continues with a compliant experiment or skips the week
- The human owner reviews the queue at their discretion
- If approved, the owner updates this Source of Truth document to relax or add a conditional exception
- The AI team can then use the relaxed constraint in the following week

### Exception requests are NOT

- A way to bypass constraints automatically
- A blocker to the weekly pipeline
- Binding on the human owner in any way

## Guardrails

- If both variants perform worse than the current baseline, keep the current version
- Maximum one experiment per week — no stacking or compound changes
- Each experiment should test a single, isolated variable
- The game must remain fully playable in both variants at all times
- Minimum 100 sessions per variant before declaring a winner

## Context for Agents

- The game is a browser-based Minesweeper clone deployed on Vercel
- Players are anonymous — tracked only via FullStory session + behavioral fingerprints
- The 32-dimension fingerprint captures play style, pacing, and interaction patterns
- Session data flows from FullStory to BigQuery for weekly analysis
- The "Game Started" custom event fires when a player clicks their first cell
- The "Game Completed" custom event fires when a player wins or loses a game
