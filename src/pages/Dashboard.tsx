import { useState, useMemo } from 'react'
import { useDashboardData } from '../hooks/useDashboardData'
import { useExperimentData } from '../hooks/useExperimentData'
import DashboardFilters from '../components/dashboard/DashboardFilters'
import StatsRow from '../components/dashboard/StatsRow'
import ConstellationScatter from '../components/dashboard/ConstellationScatter'
import LearningVelocityGauge from '../components/dashboard/LearningVelocityGauge'
import EngagementDonut from '../components/dashboard/EngagementDonut'
import UnderstandingSankey from '../components/dashboard/UnderstandingSankey'
import TopIssues from '../components/dashboard/TopIssues'
import SessionTimeline from '../components/dashboard/SessionTimeline'
import ExperimentCard from '../components/ExperimentCard'
import ExperimentTable from '../components/ExperimentTable'
import MetricChart from '../components/MetricChart'
import type { DashboardSession } from '../types/dashboard'

export default function Dashboard() {
  const { data: dashData, loading: dashLoading, error: dashError } = useDashboardData()
  const { data: expData, loading: expLoading } = useExperimentData()

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<'all' | 'a' | 'b'>('all')
  const [selectedProgression, setSelectedProgression] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const hasDashboardData = dashData && dashData.total_sessions > 0

  const weeks = useMemo(() => {
    if (!dashData) return []
    const weekSet = new Set<number>()
    for (const s of dashData.sessions) {
      if (s.experiment_week != null) weekSet.add(s.experiment_week)
    }
    return [...weekSet].sort()
  }, [dashData])

  const filteredSessions = useMemo(() => {
    if (!dashData) return []
    return dashData.sessions.filter((s: DashboardSession) => {
      if (selectedWeek != null && s.experiment_week !== selectedWeek) return false
      if (selectedVariant !== 'all') {
        const v = (s.experiment_variant || '').toLowerCase()
        if (v !== selectedVariant) return false
      }
      if (selectedProgression != null && s.summary) {
        if (s.summary.learning_progression !== selectedProgression) return false
      }
      if (selectedProgression != null && !s.summary) return false
      return true
    })
  }, [dashData, selectedWeek, selectedVariant, selectedProgression])

  const filteredProjections = useMemo(() => {
    if (!dashData) return []
    const sessionIds = new Set(filteredSessions.map((s) => s.session_id))
    return dashData.projections.filter((p) => sessionIds.has(p.session_id))
  }, [dashData, filteredSessions])

  const selectedSession = useMemo(() => {
    if (!selectedSessionId || !dashData) return null
    return dashData.sessions.find((s) => s.session_id === selectedSessionId) || null
  }, [selectedSessionId, dashData])

  // Loading state
  if (dashLoading || expLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    )
  }

  // Session detail view (Level 2 + 3)
  if (selectedSession) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <SessionTimeline
          session={selectedSession}
          onBack={() => setSelectedSessionId(null)}
        />
      </div>
    )
  }

  const currentExperiment = expData?.experiments.find(
    (e) => e.week === expData.currentWeek,
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Experiment Dashboard
        </h1>
        <p className="mt-2 text-gray-400">
          {hasDashboardData ? (
            <>
              Analyzing{' '}
              <span className="text-cyan-400">{dashData.total_sessions}</span>{' '}
              sessions with{' '}
              <span className="text-purple-400">{dashData.total_summarized}</span>{' '}
              AI-generated summaries
            </>
          ) : expData ? (
            <>
              Week {expData.currentWeek} &mdash; tracking{' '}
              <span className="text-cyan-400">{expData.experiments.length}</span>{' '}
              experiments toward the goal
            </>
          ) : (
            'Loading experiment data...'
          )}
        </p>
      </div>

      {/* Current experiment */}
      {currentExperiment && expData && (
        <div className="mb-8">
          <ExperimentCard experiment={currentExperiment} goal={expData.goal} />
        </div>
      )}

      {/* Dashboard data section */}
      {hasDashboardData ? (
        <div className="space-y-6">
          {/* Filters */}
          <DashboardFilters
            weeks={weeks}
            selectedWeek={selectedWeek}
            onWeekChange={setSelectedWeek}
            selectedVariant={selectedVariant}
            onVariantChange={setSelectedVariant}
            selectedProgression={selectedProgression}
            onProgressionChange={setSelectedProgression}
          />

          {/* Stats */}
          <StatsRow
            totalSessions={filteredSessions.length}
            totalSummarized={filteredSessions.filter((s) => s.summary).length}
            understoodPct={dashData.qualitative_report.understood_mechanics_pct || 0}
            masteredQuicklyPct={
              dashData.qualitative_report.learning_velocity?.mastered_quickly_pct || 0
            }
            generatedAt={dashData.generated_at}
          />

          {/* Constellation + Learning Velocity */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ConstellationScatter
                sessions={filteredSessions}
                projections={filteredProjections}
                onSelectSession={setSelectedSessionId}
              />
            </div>
            <div>
              {dashData.qualitative_report.learning_velocity ? (
                <LearningVelocityGauge
                  velocity={dashData.qualitative_report.learning_velocity}
                />
              ) : (
                <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 h-full flex items-center justify-center">
                  <p className="text-xs text-gray-600">Learning velocity data not yet available</p>
                </div>
              )}
            </div>
          </div>

          {/* Engagement + Understanding Flow + Issues */}
          <div className="grid gap-6 lg:grid-cols-3">
            <EngagementDonut
              distribution={dashData.qualitative_report.engagement_distribution || {}}
            />
            <UnderstandingSankey sessions={filteredSessions} />
            <TopIssues
              functionalIssues={dashData.qualitative_report.top_functional_issues || []}
              designGaps={dashData.qualitative_report.top_design_gaps || []}
              frustrationSignals={dashData.qualitative_report.top_frustration_signals || []}
            />
          </div>

          {/* Session list */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">
              Sessions ({filteredSessions.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 font-medium">Active Time</th>
                    <th className="pb-2 pr-4 font-medium">Clicks</th>
                    <th className="pb-2 pr-4 font-medium">Variant</th>
                    <th className="pb-2 pr-4 font-medium">Progression</th>
                    <th className="pb-2 pr-4 font-medium">Engagement</th>
                    <th className="pb-2 font-medium">Fingerprints</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filteredSessions.slice(0, 50).map((s) => (
                    <tr
                      key={s.session_id}
                      onClick={() => setSelectedSessionId(s.session_id)}
                      className="cursor-pointer hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-2 pr-4 font-mono text-cyan-500 truncate max-w-[120px]">
                        {s.session_id.slice(0, 12)}...
                      </td>
                      <td className="py-2 pr-4 text-gray-300">
                        {Math.round((s.active_duration_millis || 0) / 1000)}s
                      </td>
                      <td className="py-2 pr-4 text-gray-300">
                        {s.total_clicks}
                        {(s.total_rage_clicks || 0) > 0 && (
                          <span className="text-red-400 ml-1">({s.total_rage_clicks} rage)</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {s.experiment_variant ? (
                          <span className={s.experiment_variant.toLowerCase() === 'a' ? 'text-cyan-400' : 'text-purple-400'}>
                            {s.experiment_variant.toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-300">
                        {s.summary?.learning_progression?.replace('_', ' ') || '—'}
                      </td>
                      <td className="py-2 pr-4 text-gray-300">
                        {s.summary?.engagement_quality?.replace('_', ' ') || '—'}
                      </td>
                      <td className="py-2 text-gray-400">
                        {s.fingerprint_events?.length || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSessions.length > 50 && (
                <p className="text-xs text-gray-600 mt-2 text-center">
                  Showing first 50 of {filteredSessions.length} sessions
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-12 text-center">
          <div className="text-4xl mb-3">🔬</div>
          <h3 className="text-lg font-semibold text-gray-300 mb-2">
            Behavioral Intelligence Dashboard
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Run the dashboard backfill action to populate this view with real session
            data, AI-generated summaries, and fingerprint visualizations.
          </p>
          <p className="text-xs text-gray-600">
            GitHub Actions &rarr; Backfill Dashboard Data &rarr; Run workflow
          </p>
        </div>
      )}

      {/* Experiment charts (always shown) */}
      {expData && (
        <>
          <div className="mt-10 mb-6">
            <h2 className="text-xl font-bold">Experiment Metrics</h2>
          </div>
          <MetricChart experiments={expData.experiments} />

          <div className="mt-10">
            <h2 className="mb-4 text-xl font-bold">Experiment History</h2>
            <ExperimentTable experiments={expData.experiments} />
          </div>
        </>
      )}
    </div>
  )
}
