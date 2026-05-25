import { useState, useMemo, useCallback } from 'react'
import type { DashboardSession, FingerprintEvent, FingerprintAnnotation } from '../../types/dashboard'
import FingerprintRadar from './FingerprintRadar'

interface Props {
  session: DashboardSession
  onBack: () => void
}

const STATE_COLORS: Record<string, string> = {
  engaged: '#22c55e',
  deliberate: '#06b6d4',
  learning: '#8b5cf6',
  exploring: '#3b82f6',
  rushing: '#eab308',
  idle: '#6b7280',
  frustrated: '#ef4444',
  confused: '#f97316',
}

const STATE_LABELS: Record<string, string> = {
  engaged: 'Engaged',
  deliberate: 'Deliberate',
  learning: 'Learning',
  exploring: 'Exploring',
  rushing: 'Rushing',
  idle: 'Idle',
  frustrated: 'Frustrated',
  confused: 'Confused',
}

type EventType = 'started' | 'won' | 'lost' | 'variant'

interface EventStyle {
  color: string
  label: string
  type: EventType
}

function resolveEventStyle(event: FingerprintEvent): EventStyle {
  if (event.event_name === 'Game Started') {
    return { color: '#22c55e', label: 'Game Started', type: 'started' }
  }
  if (event.event_name === 'Experiment Variant Selected') {
    return { color: '#8b5cf6', label: 'Variant Selected', type: 'variant' }
  }
  if (event.event_name === 'Game Completed') {
    const props =
      typeof event.event_properties === 'string'
        ? (() => { try { return JSON.parse(event.event_properties) } catch { return {} } })()
        : event.event_properties || {}
    if ((props as Record<string, string>).outcome_str === 'win') {
      return { color: '#eab308', label: 'Game Won', type: 'won' }
    }
    return { color: '#ef4444', label: 'Game Lost', type: 'lost' }
  }
  return { color: '#9ca3af', label: event.event_name, type: 'started' }
}

function EventIcon({ type, x, y, size }: { type: EventType; x: number; y: number; size: number }) {
  const s = size
  switch (type) {
    case 'started':
      // Play triangle
      return (
        <polygon
          points={`${x - s * 0.5},${y - s} ${x + s},${y} ${x - s * 0.5},${y + s}`}
          fill="#22c55e"
          stroke="#111827"
          strokeWidth={1.2}
        />
      )
    case 'won':
      // Trophy / star
      return (
        <polygon
          points={`${x},${y - s} ${x + s * 0.38},${y - s * 0.3} ${x + s},${y - s * 0.3} ${x + s * 0.55},${y + s * 0.15} ${x + s * 0.72},${y + s} ${x},${y + s * 0.5} ${x - s * 0.72},${y + s} ${x - s * 0.55},${y + s * 0.15} ${x - s},${y - s * 0.3} ${x - s * 0.38},${y - s * 0.3}`}
          fill="#eab308"
          stroke="#111827"
          strokeWidth={1.2}
        />
      )
    case 'lost':
      // X mark
      return (
        <g stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round">
          <line x1={x - s * 0.6} y1={y - s * 0.6} x2={x + s * 0.6} y2={y + s * 0.6} />
          <line x1={x + s * 0.6} y1={y - s * 0.6} x2={x - s * 0.6} y2={y + s * 0.6} />
        </g>
      )
    case 'variant':
      // Flask / diamond
      return (
        <rect
          x={x - s * 0.55}
          y={y - s * 0.55}
          width={s * 1.1}
          height={s * 1.1}
          rx={2}
          fill="#8b5cf6"
          stroke="#111827"
          strokeWidth={1.2}
          transform={`rotate(45, ${x}, ${y})`}
        />
      )
    default:
      return <circle cx={x} cy={y} r={s} fill="#9ca3af" />
  }
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

interface RibbonSegment {
  startPct: number
  endPct: number
  state: string
  scores: Record<string, number>
  fpIndex: number
}

interface GameEventMarker {
  pct: number
  timeS: number
  label: string
  subtitle: string
  icon: string
  color: string
}

export default function SessionTimeline({ session, onBack }: Props) {
  const [selectedFpIndex, setSelectedFpIndex] = useState<number | null>(null)
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)
  const summary = session.summary
  const allEvents = session.fingerprint_events || []

  const fps = allEvents.filter((e) => e.event_name === 'Fingerprint Generated')
  const gameEvents = allEvents.filter(
    (e) => e.event_name !== 'Fingerprint Generated' && e.event_name !== 'Nexus label',
  )

  const durationMs = session.duration_millis || session.active_duration_millis || 60000
  const eventTimeMs = new Date(session.event_time).getTime()

  // event_time is the session end timestamp; derive the start
  const allTimestamps = allEvents
    .map((e) => new Date(e.event_time).getTime())
    .filter((t) => !isNaN(t))
  const earliestEvent = allTimestamps.length > 0 ? Math.min(...allTimestamps) : eventTimeMs
  const sessionStart = Math.min(earliestEvent, eventTimeMs - durationMs)
  const durationS = Math.round(durationMs / 1000)

  const annotations: FingerprintAnnotation[] =
    (summary?.fingerprint_annotations as FingerprintAnnotation[] | undefined) || []

  const ribbonSegments = useMemo((): RibbonSegment[] => {
    if (fps.length === 0 && annotations.length === 0) return []

    // Build time-proportional segments from fingerprint timestamps + annotations
    const fpTimes = fps.map((fp) => {
      const t = new Date(fp.event_time).getTime()
      return Math.min(Math.max((t - sessionStart) / durationMs, 0), 1) * 100
    })

    // If we have annotations, pair each with its FP timestamp
    if (annotations.length > 0) {
      const segments: RibbonSegment[] = []

      for (let i = 0; i < annotations.length; i++) {
        const ann = annotations[i]
        const fpIdx = ann.fingerprint_index
        const startPct = fpIdx < fpTimes.length ? fpTimes[fpIdx] : (i / annotations.length) * 100
        const nextAnn = annotations[i + 1]
        let endPct: number
        if (nextAnn) {
          const nextFpIdx = nextAnn.fingerprint_index
          endPct = nextFpIdx < fpTimes.length ? fpTimes[nextFpIdx] : ((i + 1) / annotations.length) * 100
        } else {
          endPct = 100
        }

        segments.push({
          startPct,
          endPct,
          state: ann.primary_state,
          scores: (ann.scores || {}) as Record<string, number>,
          fpIndex: fpIdx,
        })
      }
      return segments
    }

    // Fallback: no annotations, just place FPs evenly
    return fpTimes.map((pct, i) => ({
      startPct: pct,
      endPct: i < fpTimes.length - 1 ? fpTimes[i + 1] : 100,
      state: 'idle',
      scores: {},
      fpIndex: i,
    }))
  }, [fps, annotations, sessionStart, durationMs])

  const gameMarkers = useMemo((): GameEventMarker[] => {
    return gameEvents.map((event) => {
      const t = new Date(event.event_time).getTime()
      const pct = Math.min(Math.max((t - sessionStart) / durationMs, 0), 1) * 100
      const style = resolveEventStyle(event)

      return {
        pct,
        timeS: Math.round((t - sessionStart) / 1000),
        label: style.label,
        subtitle: '',
        icon: style.type,
        color: style.color,
      }
    }).sort((a, b) => a.pct - b.pct)
  }, [gameEvents, sessionStart, durationMs])

  const activeSegment = hoveredSegment != null ? ribbonSegments[hoveredSegment] : null

  const stateSequence = useMemo(() => {
    if (annotations.length === 0) return []
    const seq: { state: string; count: number }[] = []
    for (const ann of annotations) {
      const last = seq[seq.length - 1]
      if (last && last.state === ann.primary_state) {
        last.count++
      } else {
        seq.push({ state: ann.primary_state, count: 1 })
      }
    }
    return seq
  }, [annotations])

  const handleFpClick = useCallback((index: number) => {
    setSelectedFpIndex((prev) => (prev === index ? null : index))
  }, [])

  const [hoveredEvent, setHoveredEvent] = useState<number | null>(null)

  const SVG_WIDTH = 800
  const RIBBON_H = 40
  const MARGIN_TOP = 6
  const RIBBON_Y = MARGIN_TOP
  const TIME_AXIS_H = 20
  const SVG_HEIGHT = RIBBON_Y + RIBBON_H + TIME_AXIS_H + 4

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
          {summary?.archetype && (
            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-cyan-400 bg-cyan-400/10 capitalize">
              {summary.archetype.primary.replace('_', ' ')}
            </span>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {Math.round((session.active_duration_millis || 0) / 1000)}s active
            {session.experiment_variant && (
              <span className="ml-2 text-gray-600">
                Variant {session.experiment_variant.toUpperCase()}
              </span>
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
          <p className="text-sm text-gray-300 leading-relaxed">
            {summary.session_narrative}
          </p>
        </div>
      )}

      {/* Behavioral profile badges */}
      {summary?.archetype && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className="text-[10px] text-gray-500 mb-1">Archetype</div>
            <div className="text-sm font-bold text-white capitalize">
              {summary.archetype.primary.replace('_', ' ')}
            </div>
            <div className="text-[10px] text-gray-600">
              {Math.round(summary.archetype.confidence * 100)}% confidence
            </div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className="text-[10px] text-gray-500 mb-1">Intent</div>
            <div className="text-sm font-bold text-white capitalize">
              {summary.intent?.primary?.replace('_', ' ') || '—'}
            </div>
            {summary.intent?.fulfilled != null && (
              <div
                className={`text-[10px] ${summary.intent.fulfilled ? 'text-green-400' : 'text-red-400'}`}
              >
                {summary.intent.fulfilled ? 'Fulfilled' : 'Unfulfilled'}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className="text-[10px] text-gray-500 mb-1">Dominant State</div>
            <div className="text-sm font-bold text-white capitalize">
              {summary.dominant_state || '—'}
            </div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className="text-[10px] text-gray-500 mb-1">Value Score</div>
            <div
              className={`text-sm font-bold ${
                (summary.value_prediction?.score ?? 0) >= 0.7
                  ? 'text-green-400'
                  : (summary.value_prediction?.score ?? 0) >= 0.4
                    ? 'text-yellow-400'
                    : 'text-red-400'
              }`}
            >
              {summary.value_prediction?.score ?? '—'}
            </div>
            {summary.value_prediction?.will_return != null && (
              <div className="text-[10px] text-gray-600">
                {summary.value_prediction.will_return ? 'Likely to return' : 'Unlikely to return'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Behavioral Timeline */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Behavioral Timeline
          </h3>
          {activeSegment && (
            <div className="flex items-center gap-2 text-xs">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: STATE_COLORS[activeSegment.state] || '#6b7280' }}
              />
              <span className="text-gray-300 capitalize">
                {STATE_LABELS[activeSegment.state] || activeSegment.state}
              </span>
              <span className="text-gray-600">
                {Object.entries(activeSegment.scores)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 3)
                  .map(([s, v]) => `${s} ${Math.round(v * 100)}%`)
                  .join(' · ')}
              </span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-600 mb-4">
          Behavioral state, game events, and fingerprints over {durationS}s
          {fps.length > 0 && (
            <span className="text-gray-500">
              {' '}· {fps.length} fingerprints · {annotations.length} annotations
            </span>
          )}
        </p>

        {fps.length === 0 && gameEvents.length === 0 ? (
          <p className="text-xs text-gray-600">No events recorded for this session</p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* State ribbon — time-proportional segments */}
              {ribbonSegments.map((seg, i) => {
                const x = (seg.startPct / 100) * SVG_WIDTH
                const w = ((seg.endPct - seg.startPct) / 100) * SVG_WIDTH
                const isHovered = hoveredSegment === i
                const isSelected =
                  selectedFpIndex != null && seg.fpIndex === selectedFpIndex
                const isFirst = i === 0
                const isLast = i === ribbonSegments.length - 1

                return (
                  <g key={`ribbon-${i}`}>
                    <rect
                      x={x}
                      y={RIBBON_Y}
                      width={Math.max(w, 2)}
                      height={RIBBON_H}
                      fill={STATE_COLORS[seg.state] || '#6b7280'}
                      fillOpacity={isHovered || isSelected ? 0.95 : 0.55}
                      rx={isFirst || isLast ? 4 : 0}
                      ry={isFirst || isLast ? 4 : 0}
                      stroke={isSelected ? '#fff' : isHovered ? '#e5e7eb' : 'rgba(0,0,0,0.3)'}
                      strokeWidth={isSelected ? 1.5 : isHovered ? 1 : 0.5}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredSegment(i)}
                      onMouseLeave={() => setHoveredSegment(null)}
                      onClick={() => {
                        if (seg.fpIndex < fps.length) handleFpClick(seg.fpIndex)
                      }}
                    />
                    
                    {/* Fingerprint tick mark at segment start */}
                    <line
                      x1={x}
                      y1={RIBBON_Y + RIBBON_H - 3}
                      x2={x}
                      y2={RIBBON_Y + RIBBON_H + 1}
                      stroke="#fff"
                      strokeWidth={1}
                      strokeOpacity={0.25}
                      className="pointer-events-none"
                    />
                  </g>
                )
              })}

              {/* Fallback: plain track when no annotations */}
              {ribbonSegments.length === 0 && (
                <rect
                  x={0}
                  y={RIBBON_Y}
                  width={SVG_WIDTH}
                  height={RIBBON_H}
                  fill="#374151"
                  fillOpacity={0.5}
                  rx={4}
                />
              )}

              {/* Game event markers — SVG icons above the ribbon */}
              {gameMarkers.map((m, i) => {
                const cx = (m.pct / 100) * SVG_WIDTH
                const cy = RIBBON_Y - 2
                const isHovered = hoveredEvent === i
                return (
                  <g
                    key={`ge-${i}`}
                    onMouseEnter={() => setHoveredEvent(i)}
                    onMouseLeave={() => setHoveredEvent(null)}
                    className="cursor-default"
                  >
                    {/* Vertical tick through ribbon */}
                    <line
                      x1={cx}
                      y1={RIBBON_Y}
                      x2={cx}
                      y2={RIBBON_Y + RIBBON_H}
                      stroke="#fff"
                      strokeWidth={1}
                      strokeOpacity={0.25}
                      strokeDasharray="2,2"
                    />
                    {/* Icon marker */}
                    <EventIcon type={m.icon as EventType} x={cx} y={cy} size={6} />
                    {/* Hover tooltip */}
                    {isHovered && (
                      <g>
                        <rect
                          x={Math.min(Math.max(cx - 50, 2), SVG_WIDTH - 102)}
                          y={cy - 28}
                          width={100}
                          height={18}
                          rx={4}
                          fill="#111827"
                          stroke="#374151"
                          strokeWidth={1}
                        />
                        <text
                          x={Math.min(Math.max(cx, 52), SVG_WIDTH - 52)}
                          y={cy - 15}
                          textAnchor="middle"
                          fill={m.color}
                          fontSize={9}
                          fontWeight={600}
                        >
                          {m.label} · {m.timeS}s
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}

              {/* Time axis */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const x = frac * SVG_WIDTH
                return (
                  <g key={`time-${frac}`}>
                    <line
                      x1={x}
                      y1={RIBBON_Y + RIBBON_H + 2}
                      x2={x}
                      y2={RIBBON_Y + RIBBON_H + 6}
                      stroke="#4b5563"
                      strokeWidth={1}
                    />
                    <text
                      x={x}
                      y={RIBBON_Y + RIBBON_H + 16}
                      textAnchor="middle"
                      fill="#6b7280"
                      fontSize={9}
                    >
                      {Math.round(frac * durationS)}s
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* State arc summary */}
            {stateSequence.length > 0 && (
              <div className="flex items-center gap-1 mt-3 flex-wrap">
                <span className="text-[10px] text-gray-600 mr-1">Arc:</span>
                {stateSequence.map((seg, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-gray-700 text-[10px]">→</span>}
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: `${STATE_COLORS[seg.state] || '#6b7280'}20`,
                        color: STATE_COLORS[seg.state] || '#6b7280',
                      }}
                    >
                      {STATE_LABELS[seg.state] || seg.state}
                      {seg.count > 1 && (
                        <span className="text-[8px] opacity-60">×{seg.count}</span>
                      )}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-gray-500">
              {Object.entries(STATE_COLORS)
                .filter(([state]) => ribbonSegments.some((s) => s.state === state))
                .map(([state, color]) => (
                  <div key={state} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    {STATE_LABELS[state] || state}
                  </div>
                ))}
              {gameMarkers.length > 0 && (
                <div className="flex items-center gap-3 ml-2 pl-2 border-l border-gray-800">
                  {([
                    { type: 'started' as EventType, label: 'Game Started', color: '#22c55e' },
                    { type: 'won' as EventType, label: 'Game Won', color: '#eab308' },
                    { type: 'lost' as EventType, label: 'Game Lost', color: '#ef4444' },
                    { type: 'variant' as EventType, label: 'Variant Selected', color: '#8b5cf6' },
                  ])
                    .filter(({ type }) => gameMarkers.some((m) => m.icon === type))
                    .map(({ type, label }) => (
                      <div key={type} className="flex items-center gap-1">
                        <svg width={12} height={12} viewBox="0 0 12 12">
                          <EventIcon type={type} x={6} y={6} size={4} />
                        </svg>
                        {label}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Selected fingerprint detail */}
      {selectedFpIndex != null && fps[selectedFpIndex] && (
        <FingerprintRadar
          fingerprint={fps[selectedFpIndex]}
          vector={parseFingerprintVector(fps[selectedFpIndex])}
          index={selectedFpIndex}
          timestamp={Math.round(
            (new Date(fps[selectedFpIndex].event_time).getTime() - sessionStart) / 1000,
          )}
        />
      )}

      {/* Issues from summary */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { title: 'Functional Issues', items: summary.functional_issues || [], color: 'text-red-400', dot: 'bg-red-400' },
            { title: 'Design Gaps', items: summary.design_gaps || [], color: 'text-yellow-400', dot: 'bg-yellow-400' },
            { title: 'Frustration Signals', items: summary.frustration_signals || [], color: 'text-orange-400', dot: 'bg-orange-400' },
          ].map(({ title, items, color, dot }) => (
            <div key={title} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <h4
                className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${color}`}
              >
                {title}
              </h4>
              {items.length === 0 ? (
                <p className="text-xs text-gray-600">None detected</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <li
                      key={i}
                      className="text-xs text-gray-400 flex items-start gap-1.5"
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${dot} mt-1 shrink-0`}
                      />
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
          {(
            [
              ['Total Clicks', session.total_clicks],
              ['Rage Clicks', session.total_rage_clicks],
              ['Dead Clicks', session.total_dead_clicks],
              ['Fingerprints', fps.length],
              ['Browser', session.user_agent_browser || '—'],
              ['Device', session.user_agent_device || '—'],
              ['Country', session.location_country || '—'],
              ['Host', session.url_host || '—'],
            ] as [string, string | number][]
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between py-0.5">
              <span className="text-gray-500">{label}</span>
              <span className="text-gray-300">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
