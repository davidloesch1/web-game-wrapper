import { useMemo, useState } from 'react'
import type { DashboardSession, BehavioralState } from '../../types/dashboard'

interface Props {
  sessions: DashboardSession[]
  onSelectSession: (sessionId: string) => void
}

const STATE_COLORS: Record<string, string> = {
  engaged: '#22c55e',
  deliberate: '#06b6d4',
  learning: '#8b5cf6',
  exploring: '#3b82f6',
  rushing: '#eab308',
  idle: '#6b7280',
  confused: '#f97316',
  frustrated: '#ef4444',
}

const STATE_RANK: Record<string, number> = {
  frustrated: 0,
  confused: 0,
  idle: 1,
  exploring: 2,
  rushing: 2,
  learning: 3,
  deliberate: 4,
  engaged: 4,
}

type SortMode = 'value' | 'arc_length' | 'outcome'

interface SessionArc {
  sessionId: string
  states: BehavioralState[]
  timestamps: string[]
  valueScore: number | null
  willReturn: boolean | null
  archetype: string
  dominantState: string
  duration: number
  endState: BehavioralState
  startState: BehavioralState
}

function outcomeLabel(arc: SessionArc): string {
  const startRank = STATE_RANK[arc.startState] ?? 1
  const endRank = STATE_RANK[arc.endState] ?? 1
  if (endRank > startRank) return 'improved'
  if (endRank < startRank) return 'regressed'
  return 'flat'
}

export default function SessionArcs({ sessions, onSelectSession }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('value')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const arcs = useMemo(() => {
    const result: SessionArc[] = []
    for (const s of sessions) {
      const annotations = s.summary?.fingerprint_annotations
      if (!annotations || annotations.length === 0) continue

      result.push({
        sessionId: s.session_id,
        states: annotations.map((a) => a.primary_state),
        timestamps: annotations.map((a) => a.timestamp_description),
        valueScore: s.summary?.value_prediction?.score ?? null,
        willReturn: s.summary?.value_prediction?.will_return ?? null,
        archetype: s.summary?.archetype?.primary ?? 'unknown',
        dominantState: s.summary?.dominant_state ?? 'unknown',
        duration: Math.round((s.active_duration_millis || 0) / 1000),
        endState: annotations[annotations.length - 1].primary_state,
        startState: annotations[0].primary_state,
      })
    }
    return result
  }, [sessions])

  const sorted = useMemo(() => {
    const copy = [...arcs]
    switch (sortMode) {
      case 'value':
        return copy.sort((a, b) => (b.valueScore ?? -1) - (a.valueScore ?? -1))
      case 'arc_length':
        return copy.sort((a, b) => b.states.length - a.states.length)
      case 'outcome': {
        const rank = { improved: 0, flat: 1, regressed: 2 }
        return copy.sort(
          (a, b) => rank[outcomeLabel(a)] - rank[outcomeLabel(b)],
        )
      }
    }
  }, [arcs, sortMode])

  const maxSteps = Math.max(...arcs.map((a) => a.states.length), 1)

  const presentStates = new Set(arcs.flatMap((a) => a.states))

  if (arcs.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">
          Behavioral Arcs
        </h3>
        <p className="text-xs text-gray-600">
          No fingerprint annotation data available
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-gray-400">
            Behavioral Arcs
          </h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Each row is a session — colored blocks show the behavioral state at
            each fingerprint snapshot
          </p>
        </div>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-300 focus:border-cyan-500 focus:outline-none"
        >
          <option value="value">Sort: Value</option>
          <option value="outcome">Sort: Outcome</option>
          <option value="arc_length">Sort: Length</option>
        </select>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-4 mt-2 text-[10px]">
        {Object.entries(STATE_COLORS)
          .filter(([k]) => presentStates.has(k as BehavioralState))
          .map(([state, color]) => (
            <div key={state} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span className="text-gray-500 capitalize">{state}</span>
            </div>
          ))}
      </div>

      {/* Arcs */}
      <div className="space-y-px">
        {sorted.map((arc) => {
          const isHovered = hoveredId === arc.sessionId
          const outcome = outcomeLabel(arc)

          return (
            <div
              key={arc.sessionId}
              className={`flex items-center gap-2 py-0.5 px-1 rounded cursor-pointer transition-colors ${
                isHovered ? 'bg-gray-800/60' : 'hover:bg-gray-800/30'
              }`}
              onClick={() => onSelectSession(arc.sessionId)}
              onMouseEnter={() => setHoveredId(arc.sessionId)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* State blocks */}
              <div
                className="flex gap-px flex-shrink-0"
                style={{ width: `${Math.min(maxSteps * 24, 360)}px` }}
              >
                {arc.states.map((state, i) => (
                  <div
                    key={i}
                    className="relative group"
                    style={{
                      width: `${100 / maxSteps}%`,
                      minWidth: '6px',
                      maxWidth: '24px',
                    }}
                  >
                    <div
                      className="h-5 rounded-sm"
                      style={{
                        backgroundColor: STATE_COLORS[state] || '#374151',
                        opacity: isHovered ? 1 : 0.8,
                      }}
                    />
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                      {arc.timestamps[i]} — {state}
                    </div>
                  </div>
                ))}
              </div>

              {/* Value score */}
              <div className="w-10 text-right flex-shrink-0">
                {arc.valueScore != null ? (
                  <span
                    className={`text-xs font-medium ${
                      arc.valueScore >= 0.7
                        ? 'text-green-400'
                        : arc.valueScore >= 0.4
                          ? 'text-yellow-400'
                          : 'text-red-400'
                    }`}
                  >
                    {arc.valueScore.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-600">—</span>
                )}
              </div>

              {/* Outcome indicator */}
              <div className="w-5 flex-shrink-0 text-center">
                {outcome === 'improved' && (
                  <span className="text-green-400 text-xs">↑</span>
                )}
                {outcome === 'regressed' && (
                  <span className="text-red-400 text-xs">↓</span>
                )}
                {outcome === 'flat' && (
                  <span className="text-gray-600 text-xs">→</span>
                )}
              </div>

              {/* Archetype label (visible on hover) */}
              {isHovered && (
                <span className="text-[10px] text-gray-500 capitalize truncate max-w-[100px]">
                  {arc.archetype.replace('_', ' ')} · {arc.duration}s
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary stats */}
      <div className="mt-4 pt-3 border-t border-gray-800 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-bold text-green-400">
            {arcs.filter((a) => outcomeLabel(a) === 'improved').length}
          </div>
          <div className="text-[10px] text-gray-500">Improved ↑</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gray-400">
            {arcs.filter((a) => outcomeLabel(a) === 'flat').length}
          </div>
          <div className="text-[10px] text-gray-500">Flat →</div>
        </div>
        <div>
          <div className="text-lg font-bold text-red-400">
            {arcs.filter((a) => outcomeLabel(a) === 'regressed').length}
          </div>
          <div className="text-[10px] text-gray-500">Regressed ↓</div>
        </div>
      </div>
    </div>
  )
}
