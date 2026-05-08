import { useState, useMemo } from 'react'
import type { DashboardSession, FingerprintEvent } from '../../types/dashboard'
import FingerprintRadar from './FingerprintRadar'

interface Props {
  session: DashboardSession
  onBack: () => void
}

const ENGAGEMENT_BADGES: Record<string, { color: string; bg: string }> = {
  flow_state: { color: 'text-green-400', bg: 'bg-green-400/10' },
  deep: { color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  moderate: { color: 'text-purple-400', bg: 'bg-purple-400/10' },
  shallow: { color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  bounce: { color: 'text-red-400', bg: 'bg-red-400/10' },
}

function parseFingerprintVector(fp: FingerprintEvent): number[] {
  let props = fp.event_properties
  if (typeof props === 'string') {
    try {
      props = JSON.parse(props)
    } catch {
      return []
    }
  }

  const vec: number[] = []
  for (let i = 0; i < 32; i++) {
    for (const pattern of [`dim_${i}`, `d${i}`, `dimension_${i}`, `dim_${i}_real`]) {
      if (pattern in (props as Record<string, number>)) {
        vec.push(Number((props as Record<string, number>)[pattern]) || 0)
        break
      }
    }
    if (vec.length <= i) vec.push(0)
  }
  return vec.length === 32 ? vec : []
}

const GAME_EVENT_STYLES: Record<string, { icon: string; color: string; label: string }> = {
  'Game Started': { icon: '🎮', color: 'text-green-400', label: 'Game Started' },
  'Game Completed': { icon: '🏆', color: 'text-yellow-400', label: 'Game Completed' },
  'Experiment Variant Selected': { icon: '🔬', color: 'text-purple-400', label: 'Variant Selected' },
}

interface FpCluster {
  pct: number
  indices: number[]
  timeRange: [number, number]
}

const CLUSTER_THRESHOLD_PCT = 2.5

function clusterFingerprints(
  fps: FingerprintEvent[],
  sessionStart: number,
  durationMs: number,
): FpCluster[] {
  if (fps.length === 0) return []

  const sorted = fps
    .map((fp, i) => {
      const t = new Date(fp.event_time).getTime()
      const pct = Math.min(Math.max((t - sessionStart) / durationMs, 0), 1) * 100
      return { pct, origIndex: i, timeS: Math.round((t - sessionStart) / 1000) }
    })
    .sort((a, b) => a.pct - b.pct)

  const clusters: FpCluster[] = []
  let current: typeof sorted = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].pct - current[current.length - 1].pct <= CLUSTER_THRESHOLD_PCT) {
      current.push(sorted[i])
    } else {
      const avgPct = current.reduce((s, c) => s + c.pct, 0) / current.length
      clusters.push({
        pct: avgPct,
        indices: current.map((c) => c.origIndex),
        timeRange: [current[0].timeS, current[current.length - 1].timeS],
      })
      current = [sorted[i]]
    }
  }
  const avgPct = current.reduce((s, c) => s + c.pct, 0) / current.length
  clusters.push({
    pct: avgPct,
    indices: current.map((c) => c.origIndex),
    timeRange: [current[0].timeS, current[current.length - 1].timeS],
  })

  return clusters
}

interface GameEventPos {
  event: FingerprintEvent
  pct: number
  tier: number
  subtitle: string
  style: { icon: string; color: string; label: string }
  timeS: number
}

function staggerGameEvents(
  gameEvents: FingerprintEvent[],
  sessionStart: number,
  durationMs: number,
): GameEventPos[] {
  const items = gameEvents.map((event) => {
    const t = new Date(event.event_time).getTime()
    const pct = Math.min(Math.max((t - sessionStart) / durationMs, 0), 1) * 100
    const style = GAME_EVENT_STYLES[event.event_name] || {
      icon: '📌', color: 'text-gray-400', label: event.event_name,
    }

    let subtitle = ''
    const props = typeof event.event_properties === 'string'
      ? (() => { try { return JSON.parse(event.event_properties) } catch { return {} } })()
      : event.event_properties || {}
    if (event.event_name === 'Game Completed') {
      subtitle = props.outcome_str === 'win' ? ' (win)' : props.outcome_str === 'loss' ? ' (loss)' : ''
    }

    return { event, pct, tier: 0, subtitle, style, timeS: Math.round((t - sessionStart) / 1000) }
  }).sort((a, b) => a.pct - b.pct)

  for (let i = 1; i < items.length; i++) {
    let maxTier = -1
    for (let j = i - 1; j >= 0; j--) {
      if (items[i].pct - items[j].pct > 8) break
      if (items[j].tier > maxTier) maxTier = items[j].tier
    }
    if (maxTier >= 0) items[i].tier = maxTier + 1
  }

  return items
}

export default function SessionTimeline({ session, onBack }: Props) {
  const [selectedFpIndex, setSelectedFpIndex] = useState<number | null>(null)
  const [expandedClusterIdx, setExpandedClusterIdx] = useState<number | null>(null)
  const summary = session.summary
  const allEvents = session.fingerprint_events || []

  const fps = allEvents.filter((e) => e.event_name === 'Fingerprint Generated')
  const gameEvents = allEvents.filter((e) => e.event_name !== 'Fingerprint Generated' && e.event_name !== 'Nexus label')

  const sessionStart = new Date(session.event_time).getTime()
  const durationMs = session.duration_millis || session.active_duration_millis || 60000

  const clusters = useMemo(
    () => clusterFingerprints(fps, sessionStart, durationMs),
    [fps, sessionStart, durationMs],
  )

  const staggeredEvents = useMemo(
    () => staggerGameEvents(gameEvents, sessionStart, durationMs),
    [gameEvents, sessionStart, durationMs],
  )

  const maxTier = staggeredEvents.reduce((m, e) => Math.max(m, e.tier), 0)
  const tierHeight = 28
  const topPadding = (maxTier + 1) * tierHeight + 8

  const engagementStyle = summary
    ? ENGAGEMENT_BADGES[summary.engagement_quality] || { color: 'text-gray-400', bg: 'bg-gray-400/10' }
    : { color: 'text-gray-400', bg: 'bg-gray-400/10' }

  const learningOnset = summary?.learning_onset_seconds
  const learningOnsetPct =
    learningOnset != null && learningOnset >= 0
      ? Math.min((learningOnset * 1000) / durationMs, 1) * 100
      : null

  const handleClusterClick = (clusterIdx: number) => {
    const cluster = clusters[clusterIdx]
    if (cluster.indices.length === 1) {
      setSelectedFpIndex(cluster.indices[0])
      setExpandedClusterIdx(null)
    } else {
      setExpandedClusterIdx(expandedClusterIdx === clusterIdx ? null : clusterIdx)
    }
  }

  const selectedCluster = expandedClusterIdx != null ? clusters[expandedClusterIdx] : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-cyan-500 hover:text-cyan-400 mb-2 flex items-center gap-1"
          >
            <span>&larr;</span> Back to all sessions
          </button>
          <h2 className="text-xl font-bold">Session Detail</h2>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">
            {session.session_id}
          </p>
        </div>
        <div className="text-right">
          {summary && (
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${engagementStyle.color} ${engagementStyle.bg}`}>
              {summary.engagement_quality.replace('_', ' ')}
            </span>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {Math.round((session.active_duration_millis || 0) / 1000)}s active
            {session.experiment_variant && (
              <span className="ml-2 text-gray-600">Variant {session.experiment_variant.toUpperCase()}</span>
            )}
          </div>
        </div>
      </div>

      {/* AI Narrative */}
      {summary?.session_narrative && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            AI Session Narrative
          </h3>
          <p className="text-sm text-gray-300 leading-relaxed">{summary.session_narrative}</p>
        </div>
      )}

      {/* Summary badges */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className="text-[10px] text-gray-500 mb-1">Initial Understanding</div>
            <div className="text-sm font-bold text-white">{summary.initial_understanding}</div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className="text-[10px] text-gray-500 mb-1">Final Understanding</div>
            <div className="text-sm font-bold text-white">{summary.final_understanding}</div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className="text-[10px] text-gray-500 mb-1">Learning Progression</div>
            <div className="text-sm font-bold text-white">{summary.learning_progression.replace('_', ' ')}</div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className="text-[10px] text-gray-500 mb-1">Learning Onset</div>
            <div className="text-sm font-bold text-white">
              {summary.learning_onset_seconds >= 0 ? `${summary.learning_onset_seconds}s` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Session Timeline */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Session Timeline
        </h3>
        <p className="text-[10px] text-gray-600 mb-4">
          Fingerprint captures and game events over time
          {fps.length > 0 && (
            <span className="text-gray-500"> &middot; {fps.length} fingerprints in {clusters.length} groups</span>
          )}
        </p>

        {fps.length === 0 && gameEvents.length === 0 ? (
          <p className="text-xs text-gray-600">No events recorded for this session</p>
        ) : (
          <div className="relative">
            {/* Timeline bar */}
            <div className="relative mx-4" style={{ height: `${topPadding + 40}px` }}>
              {/* Base line */}
              <div
                className="absolute left-0 right-0 h-0.5 bg-gray-700"
                style={{ top: `${topPadding}px` }}
              />

              {/* Learning onset marker */}
              {learningOnsetPct != null && (
                <div
                  className="absolute w-0.5 bg-green-500/50"
                  style={{
                    left: `${learningOnsetPct}%`,
                    top: '0px',
                    bottom: '0px',
                  }}
                >
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-green-400 whitespace-nowrap font-medium">
                    learned ({learningOnset}s)
                  </div>
                </div>
              )}

              {/* Staggered game event markers (above the line) */}
              {staggeredEvents.map((item, i) => {
                const topOffset = topPadding - (item.tier + 1) * tierHeight
                return (
                  <div
                    key={`game-${i}`}
                    className="absolute -translate-x-1/2 flex flex-col items-center"
                    style={{ left: `${item.pct}%`, top: `${topOffset}px` }}
                    title={`${item.style.label}${item.subtitle} at ${item.timeS}s`}
                  >
                    <span className="text-sm">{item.style.icon}</span>
                    <span className={`text-[8px] ${item.style.color} whitespace-nowrap`}>
                      {item.style.label}{item.subtitle}
                    </span>
                    <div
                      className={`w-0.5 ${item.style.color.replace('text-', 'bg-')} opacity-30`}
                      style={{ height: `${item.tier * tierHeight + 6}px` }}
                    />
                  </div>
                )
              })}

              {/* Clustered fingerprint dots (on the line) */}
              {clusters.map((cluster, ci) => {
                const isExpanded = expandedClusterIdx === ci
                const containsSelected = selectedFpIndex != null && cluster.indices.includes(selectedFpIndex)
                const isSingle = cluster.indices.length === 1

                return (
                  <button
                    key={`cluster-${ci}`}
                    onClick={() => handleClusterClick(ci)}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all cursor-pointer flex items-center justify-center
                      ${isExpanded
                        ? 'ring-2 ring-cyan-400/40 bg-cyan-500 z-10'
                        : containsSelected
                          ? 'ring-2 ring-cyan-400/30 bg-cyan-400 z-10'
                          : isSingle
                            ? 'bg-cyan-600 hover:bg-cyan-500 hover:scale-125'
                            : 'bg-cyan-600 hover:bg-cyan-500'
                      }`}
                    style={{
                      left: `${cluster.pct}%`,
                      top: `${topPadding}px`,
                      width: isSingle ? '12px' : `${Math.min(14 + cluster.indices.length * 1.5, 28)}px`,
                      height: isSingle ? '12px' : `${Math.min(14 + cluster.indices.length * 1.5, 28)}px`,
                    }}
                    title={
                      isSingle
                        ? `Fingerprint #${cluster.indices[0] + 1} at ${cluster.timeRange[0]}s`
                        : `${cluster.indices.length} fingerprints (${cluster.timeRange[0]}s – ${cluster.timeRange[1]}s) — click to expand`
                    }
                  >
                    {!isSingle && (
                      <span className="text-[9px] font-bold text-white leading-none">
                        {cluster.indices.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Time labels */}
            <div className="flex justify-between mx-4 mt-1 text-[10px] text-gray-600">
              <span>0s</span>
              <span>{Math.round(durationMs / 2000)}s</span>
              <span>{Math.round(durationMs / 1000)}s</span>
            </div>

            {/* Legend */}
            <div className="flex gap-4 mx-4 mt-2 text-[10px] text-gray-500">
              <div className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-cyan-600" />
                Fingerprint
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block h-4 w-4 rounded-full bg-cyan-600 text-[8px] text-white flex items-center justify-center font-bold">
                  3
                </span>
                Cluster
              </div>
              {Object.entries(GAME_EVENT_STYLES).map(([name, style]) => (
                <div key={name} className="flex items-center gap-1">
                  <span>{style.icon}</span>
                  {style.label}
                </div>
              ))}
            </div>

            {/* Expanded cluster panel */}
            {selectedCluster && (
              <div className="mx-4 mt-3 rounded-lg border border-cyan-800/50 bg-cyan-950/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-cyan-400 font-semibold">
                    {selectedCluster.indices.length} fingerprints
                    ({selectedCluster.timeRange[0]}s – {selectedCluster.timeRange[1]}s)
                  </span>
                  <button
                    onClick={() => setExpandedClusterIdx(null)}
                    className="text-[10px] text-gray-500 hover:text-gray-300"
                  >
                    collapse
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCluster.indices.map((fpIdx) => {
                    const fp = fps[fpIdx]
                    const fpTimeS = Math.round(
                      (new Date(fp.event_time).getTime() - sessionStart) / 1000,
                    )
                    const isActive = selectedFpIndex === fpIdx
                    return (
                      <button
                        key={fpIdx}
                        onClick={() => setSelectedFpIndex(isActive ? null : fpIdx)}
                        className={`rounded px-2 py-1 text-[10px] transition-colors
                          ${isActive
                            ? 'bg-cyan-500 text-white font-semibold'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                          }`}
                      >
                        #{fpIdx + 1} <span className="text-gray-500">{fpTimeS}s</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected fingerprint detail (Level 3) */}
      {selectedFpIndex != null && fps[selectedFpIndex] && (
        <FingerprintRadar
          fingerprint={fps[selectedFpIndex]}
          vector={parseFingerprintVector(fps[selectedFpIndex])}
          index={selectedFpIndex}
          timestamp={
            Math.round(
              (new Date(fps[selectedFpIndex].event_time).getTime() - sessionStart) / 1000,
            )
          }
        />
      )}

      {/* Issues from summary */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { title: 'Functional Issues', items: summary.functional_issues, color: 'text-red-400', dot: 'bg-red-400' },
            { title: 'Design Gaps', items: summary.design_gaps, color: 'text-yellow-400', dot: 'bg-yellow-400' },
            { title: 'Frustration Signals', items: summary.frustration_signals, color: 'text-orange-400', dot: 'bg-orange-400' },
          ].map(({ title, items, color, dot }) => (
            <div key={title} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <h4 className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${color}`}>
                {title}
              </h4>
              {items.length === 0 ? (
                <p className="text-xs text-gray-600">None detected</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot} mt-1 shrink-0`} />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Session metadata */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Session Metadata
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
          {[
            ['Total Clicks', session.total_clicks],
            ['Rage Clicks', session.total_rage_clicks],
            ['Dead Clicks', session.total_dead_clicks],
            ['Fingerprints', fps.length],
            ['Browser', session.user_agent_browser || '—'],
            ['Device', session.user_agent_device || '—'],
            ['Country', session.location_country || '—'],
            ['Host', session.url_host || '—'],
          ].map(([label, value]) => (
            <div key={label as string} className="flex justify-between py-0.5">
              <span className="text-gray-500">{label}</span>
              <span className="text-gray-300">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
