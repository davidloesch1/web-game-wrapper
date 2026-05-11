import type { SiteSummary } from '../../types/dashboard'

interface Props {
  sitesSummary: Record<string, SiteSummary>
  onSelectSite: (siteId: string) => void
}

const SITE_COLORS: string[] = [
  '#06b6d4', '#a855f7', '#ec4899', '#22c55e', '#f97316',
  '#3b82f6', '#eab308', '#ef4444', '#14b8a6', '#f43f5e',
]

function topEntry(distribution?: Record<string, number>): string | null {
  if (!distribution) return null
  let maxKey: string | null = null
  let maxVal = -1
  for (const [k, v] of Object.entries(distribution)) {
    if (v > maxVal) {
      maxVal = v
      maxKey = k
    }
  }
  return maxKey
}

export default function SiteCards({ sitesSummary, onSelectSite }: Props) {
  const siteIds = Object.keys(sitesSummary).filter((s) => s !== 'unknown').sort()

  if (siteIds.length === 0) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {siteIds.map((siteId, idx) => {
        const summary = sitesSummary[siteId]
        const color = SITE_COLORS[idx % SITE_COLORS.length]
        const topArchetype = topEntry(summary.behavioral_summary?.archetype_distribution)
        const meanValue = summary.behavioral_summary?.value_prediction?.mean_score
        const willReturn = summary.behavioral_summary?.value_prediction?.will_return_pct

        return (
          <button
            key={siteId}
            onClick={() => onSelectSite(siteId)}
            className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 text-left transition-all hover:border-gray-600 hover:bg-gray-800/50 group"
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <h3 className="text-sm font-semibold text-gray-200 capitalize group-hover:text-white">
                {siteId}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-lg font-bold text-cyan-400">
                  {summary.total_sessions}
                </div>
                <div className="text-gray-500">Sessions</div>
              </div>
              <div>
                <div className="text-lg font-bold text-purple-400">
                  {summary.total_summarized}
                </div>
                <div className="text-gray-500">Summarized</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-300 capitalize">
                  {topArchetype?.replace('_', ' ') || '—'}
                </div>
                <div className="text-gray-500">Top Archetype</div>
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {meanValue != null ? (
                    <span className={meanValue >= 0.5 ? 'text-green-400' : 'text-yellow-400'}>
                      {meanValue.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                  {willReturn != null && (
                    <span className="text-gray-500 text-[10px] ml-1">
                      ({willReturn}% return)
                    </span>
                  )}
                </div>
                <div className="text-gray-500">Value Score</div>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to explore →
            </div>
          </button>
        )
      })}
    </div>
  )
}
