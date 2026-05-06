import type { Experiment } from '../types/experiment'

interface Props {
  experiments: Experiment[]
}

export default function VersionTimeline({ experiments }: Props) {
  const sorted = [...experiments].sort((a, b) => b.week - a.week)

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-5 top-0 h-full w-px bg-gray-800 sm:left-8" />

      <div className="space-y-8">
        {sorted.map((exp) => {
          const isRunning = exp.status === 'running'
          const winnerLabel =
            exp.winner === 'a'
              ? 'Variant A won'
              : exp.winner === 'b'
                ? 'Variant B won'
                : null

          return (
            <div key={exp.week} className="relative pl-14 sm:pl-20">
              {/* Timeline dot */}
              <div
                className={`absolute left-3 top-1 flex h-5 w-5 items-center justify-center rounded-full sm:left-6 ${
                  isRunning
                    ? 'bg-green-500 shadow-lg shadow-green-500/30'
                    : 'border-2 border-gray-700 bg-gray-900'
                }`}
              >
                {isRunning && (
                  <span className="absolute h-5 w-5 animate-ping rounded-full bg-green-500/50" />
                )}
              </div>

              <div
                className={`rounded-xl border p-5 transition ${
                  isRunning
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm font-bold text-gray-300">
                    Week {exp.week}
                  </span>
                  <span className="text-xs text-gray-600">
                    {exp.startDate} &rarr; {exp.endDate}
                  </span>
                  {isRunning && (
                    <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-green-400 ring-1 ring-green-500/30">
                      In Progress
                    </span>
                  )}
                  {winnerLabel && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                        exp.winner === 'a'
                          ? 'bg-cyan-500/10 text-cyan-400'
                          : 'bg-violet-500/10 text-violet-400'
                      }`}
                    >
                      {winnerLabel}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm text-gray-300">{exp.changelog}</p>
                <p className="mt-1 text-xs text-gray-500 italic">
                  {exp.hypothesis}
                </p>

                {exp.metrics.a != null && exp.metrics.b != null && (
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="text-cyan-400/80">
                      A: {exp.metrics.a}s
                    </span>
                    <span className="text-violet-400/80">
                      B: {exp.metrics.b}s
                    </span>
                  </div>
                )}

                {exp.versionUrl && (
                  <a
                    href={exp.versionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-xs font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    Play this version &rarr;
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
