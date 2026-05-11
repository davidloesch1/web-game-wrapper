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

type ViewMode = 'fingerprints' | 'sessions'
type ColorMode = 'archetype' | 'intent' | 'dominant_state' | 'value' | 'site'

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

const SITE_COLOR_PALETTE = [
  '#06b6d4', '#a855f7', '#ec4899', '#22c55e', '#f97316',
  '#3b82f6', '#eab308', '#ef4444', '#14b8a6', '#f43f5e',
]

function siteColorFromId(siteId: string, allSites: string[]): string {
  const idx = allSites.indexOf(siteId)
  if (idx >= 0) return SITE_COLOR_PALETTE[idx % SITE_COLOR_PALETTE.length]
  return '#374151'
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

  const summaryMap = new Map(
    sessions.filter((s) => s.summary).map((s) => [s.session_id, s.summary!]),
  )

  const allSiteIds = [...new Set(sessions.map((s) => s.site_id || 'unknown'))].sort()

  const activeProjections = viewMode === 'sessions' ? sessionProjections : projections

  const scatterData = activeProjections.map((p) => {
    const summary = summaryMap.get(p.session_id)
    const session = sessions.find((s) => s.session_id === p.session_id)
    return {
      x: p.x,
      y: p.y,
      sessionId: p.session_id,
      siteId: session?.site_id || p.site_id || 'unknown',
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

  function getDotColor(entry: (typeof scatterData)[0]): string {
    switch (colorMode) {
      case 'site':
        return siteColorFromId(entry.siteId, allSiteIds)
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
      case 'site': {
        const legend: Record<string, string> = {}
        allSiteIds.forEach((sid) => { legend[sid] = siteColorFromId(sid, allSiteIds) })
        return legend
      }
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
    if (colorMode === 'site') return d.siteId
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
            {colorMode === 'site' && d.siteId}
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
    site: 'Site',
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
