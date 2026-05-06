# Source of Truth

This document is the highest-order directive for the self-evolving game pipeline.
All experiments must align with the goal and respect the constraints below.
Only the human site owner should edit this file.

## Highest-Order Goal

Maximize average session duration for the Minesweeper game.

## Success Criteria

- Primary metric: average session duration (seconds)
- Minimum detectable effect for an experiment to "win": 5% improvement
- Secondary metric (monitor but don't optimize): return visit rate within 7 days

## Constraints

- The game must remain recognizable as Minesweeper (grid, mines, flags, reveal mechanic)
- No dark patterns: no fake urgency, deceptive UI, forced waits, or addiction mechanics
- Accessibility must not regress (color contrast, keyboard navigation, screen reader support)
- Page load time must stay under 3 seconds on 3G connections
- No experiments that require user accounts, logins, or collection of personal data
- No experiments that introduce monetization, ads, or paywalls
- No experiments that break mobile responsiveness

## Guardrails

- If both variants perform worse than the current baseline, keep the current version
- Maximum one experiment per week — no stacking or compound changes
- Each experiment should test a single, isolated variable
- The game must remain fully playable in both variants at all times

## Context for Agents

- The game is a browser-based Minesweeper clone deployed on Vercel
- Players are anonymous — tracked only via FullStory session + behavioral fingerprints
- The 32-dimension fingerprint captures play style, pacing, and interaction patterns
- Session data flows from FullStory to BigQuery for weekly analysis
