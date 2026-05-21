interface Props {
  weeks: number[]
  selectedWeek: number | null
  onWeekChange: (week: number | null) => void

  selectedVariant: 'all' | 'a' | 'b'
  onVariantChange: (variant: 'all' | 'a' | 'b') => void

  archetypes: string[]
  selectedArchetype: string | null
  onArchetypeChange: (archetype: string | null) => void

  intents: string[]
  selectedIntent: string | null
  onIntentChange: (intent: string | null) => void
}

export default function DashboardFilters({
  weeks,
  selectedWeek,
  onWeekChange,
  selectedVariant,
  onVariantChange,
  archetypes,
  selectedArchetype,
  onArchetypeChange,
  intents,
  selectedIntent,
  onIntentChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Experiment</label>
        <select
          value={selectedWeek ?? 'all'}
          onChange={(e) => onWeekChange(e.target.value === 'all' ? null : Number(e.target.value))}
          className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:border-cyan-500 focus:outline-none"
        >
          <option value="all">All</option>
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
      </div>

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

      {archetypes.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Archetype</label>
          <select
            value={selectedArchetype ?? 'all'}
            onChange={(e) => onArchetypeChange(e.target.value === 'all' ? null : e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:border-cyan-500 focus:outline-none capitalize"
          >
            <option value="all">All</option>
            {archetypes.map((a) => (
              <option key={a} value={a} className="capitalize">
                {a.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      )}

      {intents.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Intent</label>
          <select
            value={selectedIntent ?? 'all'}
            onChange={(e) => onIntentChange(e.target.value === 'all' ? null : e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:border-cyan-500 focus:outline-none capitalize"
          >
            <option value="all">All</option>
            {intents.map((i) => (
              <option key={i} value={i} className="capitalize">
                {i.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
