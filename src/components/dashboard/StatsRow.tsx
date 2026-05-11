interface StatProps {
  label: string
  value: string | number
  subtitle?: string
  color?: string
}

function Stat({ label, value, subtitle, color = 'text-white' }: StatProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {subtitle && <div className="text-[10px] text-gray-600 mt-0.5">{subtitle}</div>}
    </div>
  )
}

interface Props {
  totalSessions: number
  totalSummarized: number
  generatedAt: string
  mode: 'aggregate' | 'site'
  meanValueScore?: number | null
  willReturnPct?: number | null
  understoodPct?: number
  masteredQuicklyPct?: number
  siteCount?: number
}

export default function StatsRow({
  totalSessions,
  totalSummarized,
  generatedAt,
  mode,
  meanValueScore,
  willReturnPct,
  understoodPct,
  masteredQuicklyPct,
  siteCount,
}: Props) {
  const date = new Date(generatedAt)
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  if (mode === 'aggregate') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Sessions" value={totalSessions} color="text-cyan-400" />
        <Stat
          label="AI Summarized"
          value={totalSummarized}
          subtitle={`across ${siteCount ?? '—'} sites`}
          color="text-purple-400"
        />
        <Stat
          label="Mean Value Score"
          value={meanValueScore != null ? meanValueScore.toFixed(2) : '—'}
          color={
            meanValueScore != null && meanValueScore >= 0.5 ? 'text-green-400' : 'text-yellow-400'
          }
        />
        <Stat
          label="Will Return"
          value={willReturnPct != null ? `${willReturnPct}%` : '—'}
          subtitle={`as of ${formattedDate}`}
          color={
            willReturnPct != null && willReturnPct > 50 ? 'text-green-400' : 'text-yellow-400'
          }
        />
      </div>
    )
  }

  const hasLegacy = understoodPct != null && masteredQuicklyPct != null
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Total Sessions" value={totalSessions} color="text-cyan-400" />
      <Stat
        label="AI Summarized"
        value={totalSummarized}
        subtitle={`of ${totalSessions}`}
        color="text-purple-400"
      />
      {hasLegacy ? (
        <>
          <Stat
            label="Understood Mechanics"
            value={`${understoodPct}%`}
            color={understoodPct! > 50 ? 'text-green-400' : 'text-yellow-400'}
          />
          <Stat
            label="Mastered Quickly"
            value={`${masteredQuicklyPct}%`}
            subtitle={`as of ${formattedDate}`}
            color={masteredQuicklyPct! > 20 ? 'text-green-400' : 'text-yellow-400'}
          />
        </>
      ) : (
        <>
          <Stat
            label="Mean Value Score"
            value={meanValueScore != null ? meanValueScore.toFixed(2) : '—'}
            color={
              meanValueScore != null && meanValueScore >= 0.5
                ? 'text-green-400'
                : 'text-yellow-400'
            }
          />
          <Stat
            label="Will Return"
            value={willReturnPct != null ? `${willReturnPct}%` : '—'}
            subtitle={`as of ${formattedDate}`}
            color={
              willReturnPct != null && willReturnPct > 50 ? 'text-green-400' : 'text-yellow-400'
            }
          />
        </>
      )}
    </div>
  )
}
