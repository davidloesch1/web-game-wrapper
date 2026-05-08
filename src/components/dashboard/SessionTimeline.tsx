import { useState } from 'react'
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

export default function SessionTimeline({ session, onBack }: Props) {
  const [selectedFpIndex, setSelectedFpIndex] = useState<number | null>(null)
  const summary = session.summary
  const fps = session.fingerprint_events || []

  const sessionStart = new Date(session.event_time).getTime()
  const durationMs = session.duration_millis || session.active_duration_millis || 60000

  const engagementStyle = summary
    ? ENGAGEMENT_BADGES[summary.engagement_quality] || { color: 'text-gray-400', bg: 'bg-gray-400/10' }
    : { color: 'text-gray-400', bg: 'bg-gray-400/10' }

  const learningOnset = summary?.learning_onset_seconds
  const learningOnsetPct =
    learningOnset != null && learningOnset >= 0
      ? Math.min((learningOnset * 1000) / durationMs, 1) * 100
      : null

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

      {/* Fingerprint Timeline */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Behavioral Fingerprint Timeline
        </h3>

        {fps.length === 0 ? (
          <p className="text-xs text-gray-600">No fingerprint events recorded for this session</p>
        ) : (
          <div className="relative">
            {/* Timeline bar */}
            <div className="relative h-16 mx-4">
              {/* Base line */}
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-700 -translate-y-1/2" />

              {/* Learning onset marker */}
              {learningOnsetPct != null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-green-500/50"
                  style={{ left: `${learningOnsetPct}%` }}
                >
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-green-400 whitespace-nowrap">
                    learned ({learningOnset}s)
                  </div>
                </div>
              )}

              {/* Fingerprint dots */}
              {fps.map((fp, i) => {
                const fpTime = new Date(fp.event_time).getTime()
                const pct = Math.min(Math.max((fpTime - sessionStart) / durationMs, 0), 1) * 100
                const isSelected = selectedFpIndex === i

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedFpIndex(isSelected ? null : i)}
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all cursor-pointer
                      ${isSelected
                        ? 'h-5 w-5 bg-cyan-400 ring-2 ring-cyan-400/30 z-10'
                        : 'h-3.5 w-3.5 bg-cyan-600 hover:bg-cyan-500 hover:scale-125'
                      }`}
                    style={{ left: `${pct}%` }}
                    title={`Fingerprint ${i + 1} at ${Math.round((fpTime - sessionStart) / 1000)}s`}
                  />
                )
              })}
            </div>

            {/* Time labels */}
            <div className="flex justify-between mx-4 text-[10px] text-gray-600">
              <span>0s</span>
              <span>{Math.round(durationMs / 2000)}s</span>
              <span>{Math.round(durationMs / 1000)}s</span>
            </div>
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
