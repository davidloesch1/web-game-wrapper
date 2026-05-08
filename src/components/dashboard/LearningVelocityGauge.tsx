import type { LearningVelocity } from '../../types/dashboard'

interface Props {
  velocity: LearningVelocity
  previousVelocity?: LearningVelocity | null
}

const PROGRESSION_COLORS: Record<string, string> = {
  mastered_quickly: '#22c55e',
  progressed: '#06b6d4',
  no_change: '#eab308',
  regressed: '#ef4444',
}

const PROGRESSION_LABELS: Record<string, string> = {
  mastered_quickly: 'Mastered Quickly',
  progressed: 'Progressed',
  no_change: 'No Change',
  regressed: 'Regressed',
}

export default function LearningVelocityGauge({ velocity, previousVelocity }: Props) {
  const onset = velocity.learning_onset_seconds
  const medianSeconds = onset.median
  const prevMedian = previousVelocity?.learning_onset_seconds.median
  const trend =
    medianSeconds != null && prevMedian != null
      ? prevMedian - medianSeconds
      : null

  const progressionDist = velocity.learning_progression_distribution
  const total = Object.values(progressionDist).reduce((a, b) => a + b, 0)

  const shift = velocity.understanding_shift

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">Learning Velocity</h3>

      {/* Big number: median onset */}
      <div className="text-center mb-6">
        <div className="text-5xl font-black text-white tracking-tight">
          {medianSeconds != null ? `${medianSeconds}s` : '—'}
        </div>
        <div className="text-sm text-gray-500 mt-1">
          median time to &ldquo;get it&rdquo;
        </div>
        {trend != null && (
          <div
            className={`text-sm font-medium mt-1 ${trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-gray-500'}`}
          >
            {trend > 0 ? `↓ ${trend}s faster` : trend < 0 ? `↑ ${Math.abs(trend)}s slower` : '→ no change'}
            {' vs last week'}
          </div>
        )}
      </div>

      {/* Progression bar */}
      {total > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-1.5">Learning Progression</div>
          <div className="flex h-4 rounded-full overflow-hidden">
            {Object.entries(PROGRESSION_COLORS).map(([key, color]) => {
              const count = progressionDist[key] || 0
              const pct = (count / total) * 100
              if (pct === 0) return null
              return (
                <div
                  key={key}
                  className="relative group"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap z-10">
                    {PROGRESSION_LABELS[key]}: {count} ({Math.round(pct)}%)
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-gray-600">
            {Object.entries(PROGRESSION_LABELS).map(([key, label]) => {
              const count = progressionDist[key] || 0
              if (count === 0) return null
              return (
                <div key={key} className="flex items-center gap-1">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: PROGRESSION_COLORS[key] }}
                  />
                  {label} {Math.round((count / total) * 100)}%
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Understanding shift */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-gray-800/50 p-3">
          <div className="text-lg font-bold text-green-400">{shift.improved_pct}%</div>
          <div className="text-[10px] text-gray-500">Improved</div>
        </div>
        <div className="rounded-lg bg-gray-800/50 p-3">
          <div className="text-lg font-bold text-gray-400">{shift.flat_pct}%</div>
          <div className="text-[10px] text-gray-500">Flat</div>
        </div>
        <div className="rounded-lg bg-gray-800/50 p-3">
          <div className="text-lg font-bold text-red-400">{shift.regressed_pct}%</div>
          <div className="text-[10px] text-gray-500">Regressed</div>
        </div>
      </div>
    </div>
  )
}
