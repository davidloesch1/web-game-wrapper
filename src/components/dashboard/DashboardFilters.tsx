interface Props {
  weeks: number[]
  selectedWeek: number | null
  onWeekChange: (week: number | null) => void

  selectedVariant: 'all' | 'a' | 'b'
  onVariantChange: (variant: 'all' | 'a' | 'b') => void

  selectedProgression: string | null
  onProgressionChange: (progression: string | null) => void
}

const PROGRESSION_OPTIONS = [
  { value: 'mastered_quickly', label: 'Mastered Quickly', color: '#22c55e' },
  { value: 'progressed', label: 'Progressed', color: '#06b6d4' },
  { value: 'no_change', label: 'No Change', color: '#eab308' },
  { value: 'regressed', label: 'Regressed', color: '#ef4444' },
]

export default function DashboardFilters({
  weeks,
  selectedWeek,
  onWeekChange,
  selectedVariant,
  onVariantChange,
  selectedProgression,
  onProgressionChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
      {/* Week picker */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Week</label>
        <select
          value={selectedWeek ?? 'all'}
          onChange={(e) => onWeekChange(e.target.value === 'all' ? null : Number(e.target.value))}
          className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:border-cyan-500 focus:outline-none"
        >
          <option value="all">All Weeks</option>
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
      </div>

      {/* Variant toggle */}
      <div className="flex items-center gap-1">
        <label className="text-xs text-gray-500 mr-1">Variant</label>
        {(['all', 'a', 'b'] as const).map((v) => (
          <button
            key={v}
            onClick={() => onVariantChange(v)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedVariant === v
                ? v === 'a'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : v === 'b'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-gray-700 text-gray-200'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
          >
            {v === 'all' ? 'All' : `Variant ${v.toUpperCase()}`}
          </button>
        ))}
      </div>

      {/* Progression filter */}
      <div className="flex items-center gap-1">
        <label className="text-xs text-gray-500 mr-1">Progression</label>
        <button
          onClick={() => onProgressionChange(null)}
          className={`rounded-md px-2 py-1 text-xs transition-colors ${
            selectedProgression === null
              ? 'bg-gray-700 text-gray-200'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
        >
          All
        </button>
        {PROGRESSION_OPTIONS.map(({ value, label, color }) => (
          <button
            key={value}
            onClick={() => onProgressionChange(selectedProgression === value ? null : value)}
            className={`rounded-md px-2 py-1 text-xs flex items-center gap-1 transition-colors ${
              selectedProgression === value
                ? 'bg-gray-700 text-gray-200'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
