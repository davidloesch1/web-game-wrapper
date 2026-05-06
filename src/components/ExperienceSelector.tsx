import type { Experiment } from '../types/experiment'
import { GAME_BASE_URL } from '../config'

interface Props {
  currentExperiment?: Experiment
}

function trackVariantSelection(variant: 'A' | 'B') {
  try {
    const FS = (window as unknown as Record<string, unknown>).FS as
      | { event?: (name: string, properties: Record<string, unknown>) => void }
      | undefined
    if (FS?.event) {
      FS.event('Experiment Variant Selected', {
        variant_str: variant,
        week_int: 0,
        timestamp_str: new Date().toISOString(),
      })
    }
  } catch {
    // FullStory not loaded — no-op in dev
  }
}

const styles = {
  a: {
    gradient: 'from-cyan-500 to-blue-600',
    border: 'border-cyan-500/30 hover:border-cyan-400',
    glow: 'bg-cyan-500/5',
  },
  b: {
    gradient: 'from-violet-500 to-fuchsia-600',
    border: 'border-violet-500/30 hover:border-violet-400',
    glow: 'bg-violet-500/5',
  },
}

export default function ExperienceSelector({ currentExperiment }: Props) {
  const urlA = currentExperiment?.variantAUrl ?? GAME_BASE_URL
  const urlB = currentExperiment?.variantBUrl ?? GAME_BASE_URL

  const experiences = [
    { label: 'Experience A', url: urlA, variant: 'A' as const, ...styles.a },
    { label: 'Experience B', url: urlB, variant: 'B' as const, ...styles.b },
  ]

  return (
    <section id="play" className="border-t border-gray-800 py-20">
      <div className="mx-auto max-w-4xl px-4 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">Choose Your Experience</h2>
        <p className="mx-auto mt-3 max-w-lg text-gray-400">
          We&apos;re running a live experiment this week. Pick one &mdash; your
          choice helps shape the next version of the game.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {experiences.map((exp) => (
            <a
              key={exp.label}
              href={exp.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackVariantSelection(exp.variant)}
              className={`group relative overflow-hidden rounded-2xl border ${exp.border} ${exp.glow} p-10 transition-all hover:scale-[1.02]`}
            >
              <div
                className={`pointer-events-none absolute -top-20 right-0 h-40 w-40 rounded-full bg-gradient-to-br ${exp.gradient} opacity-20 blur-3xl transition group-hover:opacity-30`}
              />
              <div className="relative">
                <p className="text-4xl font-extrabold tracking-tight">
                  <span className={`bg-gradient-to-r ${exp.gradient} bg-clip-text text-transparent`}>
                    {exp.label}
                  </span>
                </p>
                <p className="mt-3 text-sm text-gray-500">
                  Click to play this variant
                </p>
              </div>
            </a>
          ))}
        </div>

        <p className="mt-6 text-xs text-gray-600">
          Both experiences are the same game with one experimental difference.
          We don&apos;t reveal what changed until the experiment concludes.
        </p>
      </div>
    </section>
  )
}
