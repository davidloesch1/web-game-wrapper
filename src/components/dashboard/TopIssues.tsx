interface IssueItem {
  issue: string
  count: number
}

interface Props {
  functionalIssues: IssueItem[]
  designGaps: IssueItem[]
  frustrationSignals: IssueItem[]
}

function IssueBar({ label, count, maxCount, color }: {
  label: string
  count: number
  maxCount: number
  color: string
}) {
  const pct = (count / maxCount) * 100

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 min-w-0">
        <div className="truncate text-gray-300" title={label}>
          {label}
        </div>
        <div className="mt-0.5 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <span className="text-gray-500 w-6 text-right shrink-0">{count}</span>
    </div>
  )
}

function IssueSection({ title, items, color, emptyText }: {
  title: string
  items: IssueItem[]
  color: string
  emptyText: string
}) {
  const maxCount = Math.max(...items.map((i) => i.count), 1)

  return (
    <div>
      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-gray-600">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <IssueBar
              key={item.issue}
              label={item.issue}
              count={item.count}
              maxCount={maxCount}
              color={color}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function TopIssues({ functionalIssues, designGaps, frustrationSignals }: Props) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">Top Issues Detected</h3>
      <div className="space-y-5">
        <IssueSection
          title="Functional Issues"
          items={functionalIssues}
          color="#ef4444"
          emptyText="No functional issues detected"
        />
        <IssueSection
          title="Design Gaps"
          items={designGaps}
          color="#eab308"
          emptyText="No design gaps detected"
        />
        <IssueSection
          title="Frustration Signals"
          items={frustrationSignals}
          color="#f97316"
          emptyText="No frustration signals detected"
        />
      </div>
    </div>
  )
}
