import { useState } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { DashboardSession, Projection } from '../../types/dashboard'

interface Props {
  sessions: DashboardSession[]
  projections: Projection[]
  onSelectSession: (sessionId: string) => void
}

const PROGRESSION_COLORS: Record<string, string> = {
  mastered_quickly: '#22c55e',
  progressed: '#06b6d4',
  no_change: '#eab308',
  regressed: '#ef4444',
  unknown: '#6b7280',
}

const PROGRESSION_LABELS: Record<string, string> = {
  mastered_quickly: 'Mastered Quickly',
  progressed: 'Progressed',
  no_change: 'No Change',
  regressed: 'Regressed',
  unknown: 'No Summary',
}

export default function ConstellationScatter({ sessions, projections, onSelectSession }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const summaryMap = new Map(
    sessions
      .filter((s) => s.summary)
      .map((s) => [s.session_id, s.summary!]),
  )

  const scatterData = projections.map((p) => {
    const summary = summaryMap.get(p.session_id)
    const session = sessions.find((s) => s.session_id === p.session_id)
    return {
      x: p.x,
      y: p.y,
      sessionId: p.session_id,
      progression: summary?.learning_progression || 'unknown',
      engagement: summary?.engagement_quality || 'unknown',
      variant: p.experiment_variant || 'unknown',
      duration: session?.active_duration_millis
        ? Math.round(session.active_duration_millis / 1000)
        : null,
      narrative: summary?.session_narrative || null,
    }
  })

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof scatterData[0] }> }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs shadow-xl max-w-xs">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: PROGRESSION_COLORS[d.progression] }}
          />
          <span className="font-semibold text-gray-200">
            {PROGRESSION_LABELS[d.progression]}
          </span>
          {d.variant !== 'unknown' && (
            <span className="ml-auto text-gray-500">Variant {d.variant.toUpperCase()}</span>
          )}
        </div>
        {d.duration !== null && (
          <p className="text-gray-400">Active time: {d.duration}s</p>
        )}
        {d.engagement !== 'unknown' && (
          <p className="text-gray-400">Engagement: {d.engagement}</p>
        )}
        {d.narrative && (
          <p className="mt-1 text-gray-300 leading-relaxed">{d.narrative}</p>
        )}
        <p className="mt-1 text-cyan-500 text-[10px]">Click to explore session</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-400">Session Constellation</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Each dot is a session &mdash; position from behavioral fingerprint, color from learning progression
          </p>
        </div>
        <div className="flex gap-3 text-[10px]">
          {Object.entries(PROGRESSION_LABELS).filter(([k]) => k !== 'unknown').map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: PROGRESSION_COLORS[key] }}
              />
              <span className="text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            type="number"
            dataKey="x"
            tick={{ fill: '#4b5563', fontSize: 10 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            name="PC1"
          />
          <YAxis
            type="number"
            dataKey="y"
            tick={{ fill: '#4b5563', fontSize: 10 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            name="PC2"
          />
          <Tooltip content={<CustomTooltip />} />
          <Scatter
            data={scatterData}
            onClick={(entry) => {
              if (entry?.sessionId) onSelectSession(entry.sessionId)
            }}
            onMouseEnter={(entry) => setHoveredId(entry?.sessionId)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {scatterData.map((entry, i) => (
              <Cell
                key={i}
                fill={PROGRESSION_COLORS[entry.progression]}
                fillOpacity={hoveredId === entry.sessionId ? 1 : 0.7}
                r={hoveredId === entry.sessionId ? 7 : 5}
                stroke={hoveredId === entry.sessionId ? '#fff' : 'none'}
                strokeWidth={1.5}
                cursor="pointer"
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
