import type { DashboardSession } from '../../types/dashboard'

interface Props {
  sessions: DashboardSession[]
}

const LEVELS = ['none', 'partial', 'solid', 'advanced'] as const
const LEVEL_COLORS: Record<string, string> = {
  none: '#ef4444',
  partial: '#eab308',
  solid: '#06b6d4',
  advanced: '#22c55e',
}
const LEVEL_LABELS: Record<string, string> = {
  none: 'No Understanding',
  partial: 'Partial',
  solid: 'Solid',
  advanced: 'Advanced',
}

export default function UnderstandingSankey({ sessions }: Props) {
  const summarized = sessions.filter((s) => s.summary)
  if (summarized.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">Understanding Flow</h3>
        <p className="text-xs text-gray-600">No session summaries available yet</p>
      </div>
    )
  }

  // Count flows: initial → final
  const flows: Record<string, number> = {}
  for (const s of summarized) {
    const from = s.summary!.initial_understanding
    const to = s.summary!.final_understanding
    const key = `${from}→${to}`
    flows[key] = (flows[key] || 0) + 1
  }

  const maxFlow = Math.max(...Object.values(flows), 1)
  const leftCounts: Record<string, number> = {}
  const rightCounts: Record<string, number> = {}
  for (const s of summarized) {
    const from = s.summary!.initial_understanding
    const to = s.summary!.final_understanding
    leftCounts[from] = (leftCounts[from] || 0) + 1
    rightCounts[to] = (rightCounts[to] || 0) + 1
  }

  const total = summarized.length
  const svgHeight = 200
  const nodeWidth = 24
  const padding = 8

  const getNodePositions = (counts: Record<string, number>) => {
    const levels = LEVELS.filter((l) => counts[l])
    const totalCount = levels.reduce((a, l) => a + (counts[l] || 0), 0)
    let y = 0
    const positions: Record<string, { y: number; h: number }> = {}
    for (const level of levels) {
      const count = counts[level] || 0
      const h = Math.max((count / totalCount) * (svgHeight - padding * (levels.length - 1)), 12)
      positions[level] = { y, h }
      y += h + padding
    }
    return positions
  }

  const leftPos = getNodePositions(leftCounts)
  const rightPos = getNodePositions(rightCounts)

  // Track vertical offsets for stacking flows
  const leftOffset: Record<string, number> = {}
  const rightOffset: Record<string, number> = {}

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-400">Understanding Flow</h3>
        <p className="text-xs text-gray-600 mt-0.5">
          How players&apos; understanding shifted from start to end of session
        </p>
      </div>

      <div className="flex items-start gap-0">
        {/* Labels left */}
        <div className="flex flex-col justify-start text-right pr-2 text-[10px] text-gray-500 w-20 shrink-0">
          <div className="mb-1 text-xs font-medium text-gray-400">Start</div>
          {LEVELS.filter((l) => leftPos[l]).map((level) => (
            <div
              key={level}
              style={{ height: leftPos[level].h + padding, lineHeight: `${leftPos[level].h + padding}px` }}
            >
              {LEVEL_LABELS[level]}
              <span className="text-gray-600 ml-1">({leftCounts[level]})</span>
            </div>
          ))}
        </div>

        {/* SVG flows */}
        <svg width={200} height={svgHeight + 10} className="shrink-0">
          {LEVELS.filter((from) => leftPos[from]).map((from) =>
            LEVELS.filter((to) => rightPos[to]).map((to) => {
              const count = flows[`${from}→${to}`]
              if (!count) return null

              const fromPos = leftPos[from]
              const toPos = rightPos[to]
              const fromH = (count / (leftCounts[from] || 1)) * fromPos.h
              const toH = (count / (rightCounts[to] || 1)) * toPos.h

              const fromYOff = leftOffset[from] || 0
              const toYOff = rightOffset[to] || 0
              leftOffset[from] = fromYOff + fromH
              rightOffset[to] = toYOff + toH

              const y1 = fromPos.y + fromYOff
              const y2 = toPos.y + toYOff

              const improved = LEVELS.indexOf(to) > LEVELS.indexOf(from)
              const same = from === to
              const color = improved ? '#22c55e' : same ? '#6b7280' : '#ef4444'

              return (
                <g key={`${from}-${to}`}>
                  <path
                    d={`M ${nodeWidth} ${y1 + fromH / 2}
                        C ${100} ${y1 + fromH / 2},
                          ${100} ${y2 + toH / 2},
                          ${200 - nodeWidth} ${y2 + toH / 2}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={Math.max(fromH * 0.8, 1.5)}
                    strokeOpacity={0.4}
                  />
                  <title>{`${LEVEL_LABELS[from]} → ${LEVEL_LABELS[to]}: ${count} sessions`}</title>
                </g>
              )
            }),
          )}

          {/* Left nodes */}
          {LEVELS.filter((l) => leftPos[l]).map((level) => (
            <rect
              key={`l-${level}`}
              x={0}
              y={leftPos[level].y}
              width={nodeWidth}
              height={leftPos[level].h}
              rx={4}
              fill={LEVEL_COLORS[level]}
              fillOpacity={0.8}
            />
          ))}

          {/* Right nodes */}
          {LEVELS.filter((l) => rightPos[l]).map((level) => (
            <rect
              key={`r-${level}`}
              x={200 - nodeWidth}
              y={rightPos[level].y}
              width={nodeWidth}
              height={rightPos[level].h}
              rx={4}
              fill={LEVEL_COLORS[level]}
              fillOpacity={0.8}
            />
          ))}
        </svg>

        {/* Labels right */}
        <div className="flex flex-col justify-start pl-2 text-[10px] text-gray-500 w-20 shrink-0">
          <div className="mb-1 text-xs font-medium text-gray-400">End</div>
          {LEVELS.filter((l) => rightPos[l]).map((level) => (
            <div
              key={level}
              style={{ height: (rightPos[level]?.h || 0) + padding, lineHeight: `${(rightPos[level]?.h || 0) + padding}px` }}
            >
              {LEVEL_LABELS[level]}
              <span className="text-gray-600 ml-1">({rightCounts[level]})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
