import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts'
import type { DashboardSession } from '../types/dashboard'

interface Props {
  sessions: DashboardSession[]
}

interface VariantMetrics {
  week: number
  variant: string
  count: number
  avgDuration: number
  avgValueScore: number
  engagementRate: number
  winRate: number
  wins: number
  losses: number
}

function computeVariantMetrics(sessions: DashboardSession[]): VariantMetrics[] {
  const buckets: Record<string, {
    count: number
    durations: number[]
    valueScores: number[]
    engaged: number
    wins: number
    losses: number
  }> = {}

  for (const s of sessions) {
    const v = s.experiment_variant
    const w = s.experiment_week
    if (!v || !w) continue

    const key = `${w}_${v}`
    if (!buckets[key]) {
      buckets[key] = { count: 0, durations: [], valueScores: [], engaged: 0, wins: 0, losses: 0 }
    }
    const b = buckets[key]
    b.count++

    if (s.active_duration_millis != null) {
      b.durations.push(s.active_duration_millis / 1000)
    }

    const sm = s.summary
    if (sm) {
      const vp = sm.value_prediction
      if (vp?.score != null) b.valueScores.push(vp.score)
      if (sm.dominant_state === 'engaged' || sm.dominant_state === 'deliberate') {
        b.engaged++
      }
    }

    for (const e of s.fingerprint_events || []) {
      if (e.event_name !== 'Game Completed') continue
      const props =
        typeof e.event_properties === 'string'
          ? (() => { try { return JSON.parse(e.event_properties) } catch { return {} } })()
          : e.event_properties || {}
      if ((props as Record<string, string>).outcome_str === 'win') b.wins++
      else if ((props as Record<string, string>).outcome_str === 'loss') b.losses++
    }
  }

  return Object.entries(buckets).map(([key, b]) => {
    const [wStr, variant] = key.split('_')
    const totalGames = b.wins + b.losses
    return {
      week: parseInt(wStr),
      variant,
      count: b.count,
      avgDuration: b.durations.length > 0
        ? Math.round(b.durations.reduce((a, c) => a + c, 0) / b.durations.length)
        : 0,
      avgValueScore: b.valueScores.length > 0
        ? Math.round((b.valueScores.reduce((a, c) => a + c, 0) / b.valueScores.length) * 100) / 100
        : 0,
      engagementRate: b.count > 0
        ? Math.round((b.engaged / b.count) * 100)
        : 0,
      winRate: totalGames > 0
        ? Math.round((b.wins / totalGames) * 100)
        : 0,
      wins: b.wins,
      losses: b.losses,
    }
  }).sort((a, b) => a.week - b.week || a.variant.localeCompare(b.variant))
}

const TOOLTIP_STYLE = {
  backgroundColor: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '8px',
  color: '#e5e7eb',
  fontSize: 12,
}

export default function MetricChart({ sessions }: Props) {
  const variantMetrics = useMemo(() => computeVariantMetrics(sessions), [sessions])

  const weeks = useMemo(() => {
    const wSet = new Set(variantMetrics.map((m) => m.week))
    return Array.from(wSet).sort((a, b) => a - b)
  }, [variantMetrics])

  const barData = useMemo(() => {
    return weeks.map((w) => {
      const a = variantMetrics.find((m) => m.week === w && m.variant === 'a')
      const b = variantMetrics.find((m) => m.week === w && m.variant === 'b')
      return {
        week: `Week ${w}`,
        'A — Value Score': a?.avgValueScore ?? null,
        'B — Value Score': b?.avgValueScore ?? null,
        'A — Win Rate': a ? a.winRate : null,
        'B — Win Rate': b ? b.winRate : null,
      }
    })
  }, [weeks, variantMetrics])

  const radarData = useMemo(() => {
    if (weeks.length === 0) return []
    const latestWeek = weeks[weeks.length - 1]
    const a = variantMetrics.find((m) => m.week === latestWeek && m.variant === 'a')
    const b = variantMetrics.find((m) => m.week === latestWeek && m.variant === 'b')
    if (!a && !b) return []

    return [
      { metric: 'Value Score', A: (a?.avgValueScore ?? 0) * 100, B: (b?.avgValueScore ?? 0) * 100 },
      { metric: 'Engagement', A: a?.engagementRate ?? 0, B: b?.engagementRate ?? 0 },
      { metric: 'Win Rate', A: a?.winRate ?? 0, B: b?.winRate ?? 0 },
      { metric: 'Avg Duration', A: Math.min((a?.avgDuration ?? 0) / 2, 100), B: Math.min((b?.avgDuration ?? 0) / 2, 100) },
      { metric: 'Sessions', A: Math.min((a?.count ?? 0) * 5, 100), B: Math.min((b?.count ?? 0) * 5, 100) },
    ]
  }, [weeks, variantMetrics])

  const latestWeek = weeks.length > 0 ? weeks[weeks.length - 1] : null

  if (variantMetrics.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">Experiment Metrics</h3>
        <p className="text-xs text-gray-600">
          No experiment variant data found in sessions
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Bar chart: Value Score + Win Rate by variant per week */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h3 className="mb-1 text-sm font-semibold text-gray-400">
          Variant Performance by Week
        </h3>
        <p className="text-[10px] text-gray-600 mb-4">
          Value score (0–1) and win rate (%) per variant
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="week"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              domain={[0, 1]}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            <Bar dataKey="A — Value Score" fill="#06b6d4" radius={[3, 3, 0, 0]} />
            <Bar dataKey="B — Value Score" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* Summary stats below chart */}
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-800">
          {weeks.map((w) => {
            const a = variantMetrics.find((m) => m.week === w && m.variant === 'a')
            const b = variantMetrics.find((m) => m.week === w && m.variant === 'b')
            return (
              <div key={w} className="text-[10px]">
                <div className="text-gray-500 font-medium mb-1">Week {w}</div>
                <div className="flex justify-between text-gray-400">
                  <span>
                    <span className="text-cyan-400">A</span>: {a?.count ?? 0} sessions, {a?.winRate ?? 0}% win
                  </span>
                  <span>
                    <span className="text-purple-400">B</span>: {b?.count ?? 0} sessions, {b?.winRate ?? 0}% win
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Radar chart: latest week A vs B comparison */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h3 className="mb-1 text-sm font-semibold text-gray-400">
          Variant Comparison {latestWeek ? `— Week ${latestWeek}` : ''}
        </h3>
        <p className="text-[10px] text-gray-600 mb-4">
          Multi-dimensional comparison of the latest experiment
        </p>
        {radarData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1f2937" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                />
                <PolarRadiusAxis
                  tick={{ fill: '#4b5563', fontSize: 9 }}
                  domain={[0, 100]}
                  axisLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Radar
                  dataKey="A"
                  stroke="#06b6d4"
                  fill="#06b6d4"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  name="Variant A"
                />
                <Radar
                  dataKey="B"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  name="Variant B"
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              </RadarChart>
            </ResponsiveContainer>

            {/* Quick insight */}
            {latestWeek && (() => {
              const a = variantMetrics.find((m) => m.week === latestWeek && m.variant === 'a')
              const b = variantMetrics.find((m) => m.week === latestWeek && m.variant === 'b')
              if (!a || !b) return null
              const aScore = a.avgValueScore + a.engagementRate / 100 + a.winRate / 100
              const bScore = b.avgValueScore + b.engagementRate / 100 + b.winRate / 100
              const leader = aScore >= bScore ? 'A' : 'B'
              const leaderColor = leader === 'A' ? 'text-cyan-400' : 'text-purple-400'
              return (
                <div className="text-center mt-2 text-[10px] text-gray-500">
                  <span className={`font-semibold ${leaderColor}`}>Variant {leader}</span>
                  {' '}leads across combined metrics in Week {latestWeek}
                </div>
              )
            })()}
          </>
        ) : (
          <p className="text-xs text-gray-600">Not enough data for comparison</p>
        )}
      </div>
    </div>
  )
}
