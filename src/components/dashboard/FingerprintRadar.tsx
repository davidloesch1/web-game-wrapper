import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { FingerprintEvent } from '../../types/dashboard'

interface Props {
  fingerprint: FingerprintEvent
  vector: number[]
  index: number
  timestamp: number
}

const DIMENSION_GROUPS = [
  { start: 0, end: 7, label: 'Dim 0–7' },
  { start: 8, end: 15, label: 'Dim 8–15' },
  { start: 16, end: 23, label: 'Dim 16–23' },
  { start: 24, end: 31, label: 'Dim 24–31' },
]

export default function FingerprintRadar({ vector, index, timestamp }: Props) {
  if (vector.length !== 32) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Fingerprint #{index + 1}
        </h3>
        <p className="text-xs text-gray-600">Invalid fingerprint vector</p>
      </div>
    )
  }

  // Build grouped radar data (average each 4-dim group into 8 points)
  const radarData = []
  for (let i = 0; i < 32; i += 4) {
    const groupAvg =
      (Math.abs(vector[i]) + Math.abs(vector[i + 1]) + Math.abs(vector[i + 2]) + Math.abs(vector[i + 3])) / 4
    const groupIdx = Math.floor(i / 8)
    const subIdx = (i % 8) / 4
    radarData.push({
      dimension: `${DIMENSION_GROUPS[groupIdx].label} ${subIdx === 0 ? 'α' : 'β'}`,
      value: Math.round(groupAvg * 100) / 100,
    })
  }

  // Build heatmap data
  const maxAbs = Math.max(...vector.map(Math.abs), 0.01)

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Fingerprint #{index + 1}
          </h3>
          <p className="text-[10px] text-gray-600 mt-0.5">
            Captured at {timestamp}s into session
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Radar chart */}
        <div>
          <div className="text-[10px] text-gray-500 mb-2 text-center">Behavioral Pattern Shape</div>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#1f2937" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fill: '#6b7280', fontSize: 9 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid #1f2937',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  fontSize: 11,
                }}
              />
              <Radar
                dataKey="value"
                stroke="#06b6d4"
                fill="#06b6d4"
                fillOpacity={0.2}
                strokeWidth={1.5}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Heatmap */}
        <div>
          <div className="text-[10px] text-gray-500 mb-2">32-Dimension Heatmap</div>
          <div className="grid grid-cols-8 gap-0.5">
            {vector.map((val, i) => {
              const intensity = Math.abs(val) / maxAbs
              const hue = val >= 0 ? 190 : 0
              const lightness = 15 + intensity * 40

              return (
                <div
                  key={i}
                  className="aspect-square rounded-sm relative group cursor-default"
                  style={{
                    backgroundColor: `hsl(${hue}, 80%, ${lightness}%)`,
                  }}
                >
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                    dim {i}: {val.toFixed(3)}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Group labels */}
          <div className="grid grid-cols-4 mt-2 text-[9px] text-gray-600">
            {DIMENSION_GROUPS.map((g) => (
              <div key={g.label} className="text-center">
                {g.label}
                <div className="text-gray-700">dims {g.start}–{g.end}</div>
              </div>
            ))}
          </div>

          {/* Scale */}
          <div className="flex items-center justify-center gap-2 mt-3 text-[9px] text-gray-600">
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'hsl(0, 80%, 35%)' }} />
              <span>Negative</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'hsl(0, 0%, 15%)' }} />
              <span>Neutral</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'hsl(190, 80%, 45%)' }} />
              <span>Positive</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
