import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { DashboardSession } from '../../types/dashboard'

interface Props {
  sessions: DashboardSession[]
}

const ENGAGEMENT_COLORS: Record<string, string> = {
  flow_state: '#22c55e',
  deep: '#06b6d4',
  moderate: '#8b5cf6',
  shallow: '#eab308',
  bounce: '#ef4444',
}

const ENGAGEMENT_LABELS: Record<string, string> = {
  flow_state: 'Flow State',
  deep: 'Deep',
  moderate: 'Moderate',
  shallow: 'Shallow',
  bounce: 'Bounce',
}

const ENGAGEMENT_ORDER = ['flow_state', 'deep', 'moderate', 'shallow', 'bounce']

const STATE_TO_ENGAGEMENT: Record<string, string> = {
  engaged: 'flow_state',
  deliberate: 'deep',
  learning: 'moderate',
  exploring: 'moderate',
  rushing: 'shallow',
  idle: 'shallow',
  frustrated: 'bounce',
  confused: 'bounce',
}

function classifyEngagement(session: DashboardSession): string {
  const summary = session.summary
  if (!summary) return 'shallow'

  const dominant = summary.dominant_state as string | undefined
  if (dominant && STATE_TO_ENGAGEMENT[dominant]) {
    const valuePred = summary.value_prediction as { score?: number } | undefined
    if (
      dominant === 'engaged' &&
      valuePred?.score != null &&
      valuePred.score < 0.6
    ) {
      return 'deep'
    }
    return STATE_TO_ENGAGEMENT[dominant]
  }

  return 'shallow'
}

export default function EngagementDonut({ sessions }: Props) {
  const distribution = useMemo(() => {
    const dist: Record<string, number> = {}
    for (const s of sessions) {
      if (!s.summary) continue
      const level = classifyEngagement(s)
      dist[level] = (dist[level] || 0) + 1
    }
    return dist
  }, [sessions])

  const total = Object.values(distribution).reduce((a, b) => a + b, 0)
  if (total === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">Engagement Quality</h3>
        <p className="text-xs text-gray-600">No session data available</p>
      </div>
    )
  }

  const data = ENGAGEMENT_ORDER
    .filter((key) => (distribution[key] || 0) > 0)
    .map((key) => ({
      name: ENGAGEMENT_LABELS[key] || key,
      value: distribution[key] || 0,
      key,
    }))

  const deepEngaged = (distribution.flow_state || 0) + (distribution.deep || 0)
  const deepPct = Math.round((deepEngaged / total) * 100)

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof data[0] }> }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs shadow-xl">
        <span className="font-medium text-gray-200">{d.name}</span>
        <span className="text-gray-500 ml-2">
          {d.value} ({Math.round((d.value / total) * 100)}%)
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">Engagement Quality</h3>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={ENGAGEMENT_COLORS[entry.key] || '#6b7280'}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{deepPct}%</div>
            <div className="text-[10px] text-gray-500">deeply engaged</div>
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 mt-2 text-[10px]">
        {data.map((entry) => (
          <div key={entry.key} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: ENGAGEMENT_COLORS[entry.key] }}
            />
            <span className="text-gray-500">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
