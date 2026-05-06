# Self-Evolving Game — Wrapper Site

An informational homepage for a self-evolving game experiment. Every week, AI autonomously analyzes player data, designs a single A/B experiment, runs it, and advances the winning variant. This wrapper site introduces visitors to the concept and provides tools to explore the experiment history.

## Pages

| Route | Purpose |
|---|---|
| `/` | Landing page — explains the project, offers A/B experience selection, teases version history |
| `/dashboard` | Experiment dashboard — current experiment, goal metric charts, full experiment history table |
| `/versions` | Version timeline — chronological view of every game version with changelogs and results |

## Tech Stack

- **React 18 + TypeScript** (Vite)
- **Tailwind CSS** (via `@tailwindcss/vite`)
- **React Router** (client-side routing)
- **Recharts** (data visualization)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Production Build

```bash
npm run build
npm run preview
```

## Data Pipeline Integration

The site reads experiment data from `public/data/experiments.json`. This file is designed to be overwritten by an automated pipeline each week.

### Schema

```json
{
  "goal": "Maximize average session duration",
  "currentWeek": 12,
  "experiments": [
    {
      "week": 12,
      "status": "running",
      "hypothesis": "...",
      "variantA": "Description of control",
      "variantB": "Description of treatment",
      "startDate": "2026-05-04",
      "endDate": "2026-05-10",
      "metrics": { "a": null, "b": null },
      "winner": null,
      "changelog": "Short description of what changed",
      "versionUrl": null
    }
  ]
}
```

- `status` — `"running"` or `"complete"`
- `metrics.a` / `metrics.b` — measured values for each variant (null while running)
- `winner` — `"a"`, `"b"`, or `null`
- `versionUrl` — optional link to an archived version of the game
- `changelog` — human-readable summary of what this version changed

To update the site, replace `public/data/experiments.json` and redeploy.

## Configuration

Game URLs for the A/B experience selector are defined in `src/config.ts`. Update these when the game is deployed:

```ts
export const GAME_URL_A = 'https://game.example.com/?variant=a'
export const GAME_URL_B = 'https://game.example.com/?variant=b'
```
