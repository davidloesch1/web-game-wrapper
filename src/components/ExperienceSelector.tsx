import { GAME_URL_A, GAME_URL_B } from '../config'

const experiences = [
  {
    label: 'Experience A',
    url: GAME_URL_A,
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-600',
    border: 'border-cyan-500/30 hover:border-cyan-400',
    glow: 'bg-cyan-500/5',
  },
  {
    label: 'Experience B',
    url: GAME_URL_B,
    color: 'violet',
    gradient: 'from-violet-500 to-fuchsia-600',
    border: 'border-violet-500/30 hover:border-violet-400',
    glow: 'bg-violet-500/5',
  },
]

export default function ExperienceSelector() {
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
