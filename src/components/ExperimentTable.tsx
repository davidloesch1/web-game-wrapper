import type { Experiment } from '../types/experiment'

interface Props {
  experiments: Experiment[]
}

export default function ExperimentTable({ experiments }: Props) {
  const completed = experiments
    .filter((e) => e.status === 'complete')
    .sort((a, b) => b.week - a.week)

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/80 text-xs uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3 font-semibold">Week</th>
            <th className="px-4 py-3 font-semibold">Hypothesis</th>
            <th className="px-4 py-3 font-semibold text-center">A</th>
            <th className="px-4 py-3 font-semibold text-center">B</th>
            <th className="px-4 py-3 font-semibold text-center">Winner</th>
            <th className="px-4 py-3 font-semibold text-right">Delta</th>
          </tr>
        </thead>
        <tbody>
          {completed.map((exp) => {
            const delta =
              exp.metrics.a != null && exp.metrics.b != null
                ? Math.abs(exp.metrics.b - exp.metrics.a)
                : null

            return (
              <tr
                key={exp.week}
                className="border-b border-gray-800/50 transition hover:bg-gray-900/50"
              >
                <td className="px-4 py-3 font-mono font-semibold text-gray-300">
                  {exp.week}
                </td>
                <td className="max-w-xs px-4 py-3 text-gray-400">
                  <span className="line-clamp-2">{exp.hypothesis}</span>
                </td>
                <td className="px-4 py-3 text-center font-mono text-gray-300">
                  {exp.metrics.a ?? '—'}
                </td>
                <td className="px-4 py-3 text-center font-mono text-gray-300">
                  {exp.metrics.b ?? '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                      exp.winner === 'a'
                        ? 'bg-cyan-500/10 text-cyan-400'
                        : 'bg-violet-500/10 text-violet-400'
                    }`}
                  >
                    {exp.winner}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-green-400">
                  {delta != null ? `+${delta}s` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
