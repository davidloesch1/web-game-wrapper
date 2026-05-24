interface IssueItem {
  issue: string
  count: number
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

function IssueCard({ title, items, color, emptyText }: {
  title: string
  items: IssueItem[]
  color: string
  emptyText: string
}) {
  const maxCount = Math.max(...items.map((i) => i.count), 1)

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
      <h4 className="text-sm font-semibold text-gray-400 mb-3">{title}</h4>
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

export function FunctionalIssuesCard({ items }: { items: IssueItem[] }) {
  return (
    <IssueCard
      title="Functional Issues"
      items={items}
      color="#ef4444"
      emptyText="No functional issues detected"
    />
  )
}

export function DesignGapsCard({ items }: { items: IssueItem[] }) {
  return (
    <IssueCard
      title="Design Gaps"
      items={items}
      color="#eab308"
      emptyText="No design gaps detected"
    />
  )
}

export function FrustrationSignalsCard({ items }: { items: IssueItem[] }) {
  return (
    <IssueCard
      title="Frustration Signals"
      items={items}
      color="#f97316"
      emptyText="No frustration signals detected"
    />
  )
}
