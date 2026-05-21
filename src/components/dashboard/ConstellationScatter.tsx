import { useState, useMemo } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceArea,
  Label,
} from 'recharts'
import type { DashboardSession, Projection } from '../../types/dashboard'

type ViewMode = 'fingerprints' | 'sessions'
type ColorMode = 'archetype' | 'intent' | 'dominant_state' | 'value'

interface Props {
  sessions: DashboardSession[]
  projections: Projection[]
  sessionProjections: Projection[]
  onSelectSession: (sessionId: string) => void
}

const ARCHETYPE_COLORS: Record<string, string> = {
  methodical: '#06b6d4',
  impulsive: '#f97316',
  cautious: '#8b5cf6',
  optimizer: '#22c55e',
  tourist: '#6b7280',
  power_user: '#eab308',
  explorer: '#3b82f6',
  completionist: '#ec4899',
  unknown: '#374151',
}

const INTENT_COLORS: Record<string, string> = {
  evaluating: '#8b5cf6',
  completing: '#22c55e',
  returning: '#06b6d4',
  comparing: '#f97316',
  entertainment: '#ec4899',
  problem_solving: '#ef4444',
  learning: '#3b82f6',
  habitual: '#eab308',
  unknown: '#374151',
}

const STATE_COLORS: Record<string, string> = {
  engaged: '#22c55e',
  confused: '#f97316',
  frustrated: '#ef4444',
  exploring: '#3b82f6',
  deliberate: '#06b6d4',
  idle: '#6b7280',
  rushing: '#eab308',
  learning: '#8b5cf6',
  unknown: '#374151',
}

function valueToColor(score: number): string {
  if (score >= 0.7) return '#22c55e'
  if (score >= 0.4) return '#eab308'
  return '#ef4444'
}

export default function ConstellationScatter({
  sessions,
  projections,
  sessionProjections,
  onSelectSession,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('sessions')
  const [colorMode, setColorMode] = useState<ColorMode>('archetype')
  const [showZones, setShowZones] = useState(true)

  const summaryMap = new Map(
    sessions.filter((s) => s.summary).map((s) => [s.session_id, s.summary!]),
  )

  const activeProjections = viewMode === 'sessions' ? sessionProjections : projections

  const scatterData = activeProjections.map((p) => {
    const summary = summaryMap.get(p.session_id)
    const session = sessions.find((s) => s.session_id === p.session_id)
    return {
      x: p.x,
      y: p.y,
      sessionId: p.session_id,
      archetype: summary?.archetype?.primary || 'unknown',
      archetypeConfidence: summary?.archetype?.confidence,
      intent: summary?.intent?.primary || 'unknown',
      intentFulfilled: summary?.intent?.fulfilled,
      dominantState: summary?.dominant_state || 'unknown',
      valueScore: summary?.value_prediction?.score,
      willReturn: summary?.value_prediction?.will_return,
      variant: p.experiment_variant || 'unknown',
      duration: session?.active_duration_millis
        ? Math.round(session.active_duration_millis / 1000)
        : null,
      narrative: summary?.session_narrative || null,
      fingerprintIndex: p.fingerprint_index,
      fingerprintCount: p.fingerprint_count,
      eventTime: p.event_time || null,
    }
  })

  const zones = useMemo(() => {
    const scored = scatterData.filter((d) => d.valueScore != null)
    if (scored.length < 5) return []

    const tiers = {
      high: scored.filter((d) => d.valueScore! >= 0.7),
      mid: scored.filter((d) => d.valueScore! >= 0.4 && d.valueScore! < 0.7),
      low: scored.filter((d) => d.valueScore! < 0.4),
    }

    const pad = 0.12

    function bounds(points: typeof scored) {
      if (points.length < 2) return null
      const xs = points.map((p) => p.x)
      const ys = points.map((p) => p.y)
      return {
        x1: Math.min(...xs) - pad,
        x2: Math.max(...xs) + pad,
        y1: Math.min(...ys) - pad,
        y2: Math.max(...ys) + pad,
      }
    }

    const result: Array<{
      label: string
      color: string
      fill: string
      avgValue: number
      count: number
      x1: number
      x2: number
      y1: number
      y2: number
    }> = []

    const highBounds = bounds(tiers.high)
    if (highBounds) {
      const avg = tiers.high.reduce((s, d) => s + d.valueScore!, 0) / tiers.high.length
      result.push({
        label: `High-Value Zone (avg ${avg.toFixed(2)})`,
        color: '#22c55e',
        fill: 'rgba(34, 197, 94, 0.06)',
        avgValue: avg,
        count: tiers.high.length,
        ...highBounds,
      })
    }

    const lowBounds = bounds(tiers.low)
    if (lowBounds) {
      const avg = tiers.low.reduce((s, d) => s + d.valueScore!, 0) / tiers.low.length
      result.push({
        label: `At-Risk Zone (avg ${avg.toFixed(2)})`,
        color: '#ef4444',
        fill: 'rgba(239, 68, 68, 0.06)',
        avgValue: avg,
        count: tiers.low.length,
        ...lowBounds,
      })
    }

    return result
  }, [scatterData])

  function getDotColor(entry: (typeof scatterData)[0]): string {
    switch (colorMode) {
      case 'archetype':
        return ARCHETYPE_COLORS[entry.archetype] || ARCHETYPE_COLORS.unknown
      case 'intent':
        return INTENT_COLORS[entry.intent] || INTENT_COLORS.unknown
      case 'dominant_state':
        return STATE_COLORS[entry.dominantState] || STATE_COLORS.unknown
      case 'value':
        return entry.valueScore != null
          ? valueToColor(entry.valueScore)
          : '#374151'
    }
  }

  function getActiveLegend(): Record<string, string> {
    switch (colorMode) {
      case 'archetype':
        return ARCHETYPE_COLORS
      case 'intent':
        return INTENT_COLORS
      case 'dominant_state':
        return STATE_COLORS
      case 'value':
        return { 'High (≥0.7)': '#22c55e', 'Medium': '#eab308', 'Low (<0.4)': '#ef4444' }
    }
  }

  const activeLegend = getActiveLegend()
  const presentKeys = new Set(scatterData.map((d) => {
    if (colorMode === 'value') return d.valueScore != null ? (d.valueScore >= 0.7 ? 'High (≥0.7)' : d.valueScore >= 0.4 ? 'Medium' : 'Low (<0.4)') : ''
    if (colorMode === 'archetype') return d.archetype
    if (colorMode === 'intent') return d.intent
    return d.dominantState
  }))

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: Array<{ payload: (typeof scatterData)[0] }>
  }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs shadow-xl max-w-xs">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: getDotColor(d) }}
          />
          <span className="font-semibold text-gray-200 capitalize">
            {colorMode === 'archetype' && d.archetype.replace('_', ' ')}
            {colorMode === 'intent' && d.intent.replace('_', ' ')}
            {colorMode === 'dominant_state' && d.dominantState}
            {colorMode === 'value' && (d.valueScore != null ? `Value: ${d.valueScore}` : 'No score')}
          </span>
          {d.variant !== 'unknown' && (
            <span className="ml-auto text-gray-500">
              Variant {d.variant.toUpperCase()}
            </span>
          )}
        </div>
        {d.archetype !== 'unknown' && colorMode !== 'archetype' && (
          <p className="text-gray-400">Archetype: <span className="text-gray-300 capitalize">{d.archetype.replace('_', ' ')}</span></p>
        )}
        {d.intent !== 'unknown' && colorMode !== 'intent' && (
          <p className="text-gray-400">
            Intent: <span className="text-gray-300 capitalize">{d.intent.replace('_', ' ')}</span>
            {d.intentFulfilled != null && (
              <span className={d.intentFulfilled ? 'text-green-400 ml-1' : 'text-red-400 ml-1'}>
                {d.intentFulfilled ? '✓ fulfilled' : '✗ unfulfilled'}
              </span>
            )}
          </p>
        )}
        {d.willReturn != null && colorMode !== 'value' && (
          <p className="text-gray-400">
            Value: <span className="text-gray-300">{d.valueScore}</span>
            <span className={d.willReturn ? 'text-green-400 ml-1' : 'text-red-400 ml-1'}>
              {d.willReturn ? '→ likely return' : '→ unlikely return'}
            </span>
          </p>
        )}
        {viewMode === 'fingerprints' && d.fingerprintIndex != null && (
          <p className="text-gray-400">
            Fingerprint #{d.fingerprintIndex + 1}
            {d.eventTime && (
              <span className="text-gray-500 ml-1">
                &middot; {new Date(d.eventTime).toLocaleTimeString()}
              </span>
            )}
          </p>
        )}
        {viewMode === 'sessions' && d.fingerprintCount != null && (
          <p className="text-gray-400">
            {d.fingerprintCount} fingerprint{d.fingerprintCount !== 1 ? 's' : ''} in session
          </p>
        )}
        {d.duration !== null && (
          <p className="text-gray-400">Active time: {d.duration}s</p>
        )}
        {d.narrative && (
          <p className="mt-1 text-gray-300 leading-relaxed">{d.narrative}</p>
        )}
        <p className="mt-1 text-cyan-500 text-[10px]">Click to explore session</p>
      </div>
    )
  }

  const descriptions: Record<ViewMode, string> = {
    sessions:
      'Each dot is one session — position from behavioral fingerprint centroid',
    fingerprints:
      'Each dot is one fingerprint snapshot — similar positions mean similar behavior at that moment',
  }

  const colorLabels: Record<ColorMode, string> = {
    archetype: 'Archetype',
    intent: 'Intent',
    dominant_state: 'State',
    value: 'Value',
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-400">
            Session Constellation
          </h3>
          <p className="text-xs text-gray-600 mt-0.5">{descriptions[viewMode]}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-300 focus:border-cyan-500 focus:outline-none"
          >
            <option value="sessions">
              By Session ({sessionProjections.length})
            </option>
            <option value="fingerprints">
              By Fingerprint ({projections.length})
            </option>
          </select>
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
            className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-300 focus:border-cyan-500 focus:outline-none"
          >
            {Object.entries(colorLabels).map(([k, v]) => (
              <option key={k} value={k}>Color: {v}</option>
            ))}
          </select>
          {zones.length > 0 && (
            <button
              onClick={() => setShowZones((v) => !v)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                showZones
                  ? 'border-cyan-600 bg-cyan-900/30 text-cyan-400'
                  : 'border-gray-700 bg-gray-800 text-gray-500'
              }`}
            >
              Zones
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 text-[10px]">
        {Object.entries(activeLegend)
          .filter(([k]) => k !== 'unknown' && presentKeys.has(k))
          .map(([key, color]) => (
            <div key={key} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-gray-500 capitalize">{key.replace('_', ' ')}</span>
            </div>
          ))}
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
          {showZones && zones.map((zone) => (
            <ReferenceArea
              key={zone.label}
              x1={zone.x1}
              x2={zone.x2}
              y1={zone.y1}
              y2={zone.y2}
              fill={zone.fill}
              stroke={zone.color}
              strokeOpacity={0.3}
              strokeDasharray="4 4"
            >
              <Label
                value={zone.label}
                position="insideTopLeft"
                fill={zone.color}
                fontSize={10}
                opacity={0.7}
              />
            </ReferenceArea>
          ))}
          <Tooltip content={<CustomTooltip />} />
          <Scatter
            data={scatterData}
            onClick={(_data, _index) => {
              const point = scatterData[_index as number]
              if (point?.sessionId) onSelectSession(point.sessionId)
            }}
          >
            {scatterData.map((entry, i) => (
              <Cell
                key={i}
                fill={getDotColor(entry)}
                fillOpacity={viewMode === 'fingerprints' ? 0.5 : 0.7}
                r={viewMode === 'fingerprints' ? 4 : 6}
                cursor="pointer"
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
