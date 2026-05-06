import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { Experiment } from '../types/experiment'

interface Props {
  experiments: Experiment[]
}

export default function MetricChart({ experiments }: Props) {
  const completed = experiments
    .filter((e) => e.status === 'complete')
    .sort((a, b) => a.week - b.week)

  const winnerMetric = completed.map((e) => ({
    week: `Wk ${e.week}`,
    value:
      e.winner === 'a' ? e.metrics.a : e.winner === 'b' ? e.metrics.b : null,
  }))

  const comparisonData = completed.map((e) => ({
    week: `Wk ${e.week}`,
    A: e.metrics.a,
    B: e.metrics.b,
  }))

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Line chart: winning metric over time */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-400">
          Goal Metric Over Time (Winner Each Week)
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={winnerMetric}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="week"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
              unit="s"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #1f2937',
                borderRadius: '8px',
                color: '#e5e7eb',
                fontSize: 13,
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ fill: '#06b6d4', r: 4 }}
              activeDot={{ r: 6 }}
              name="Avg Session (s)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bar chart: A vs B per experiment */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-400">
          Variant A vs B Performance
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={comparisonData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="week"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
              unit="s"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #1f2937',
                borderRadius: '8px',
                color: '#e5e7eb',
                fontSize: 13,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: '#9ca3af' }}
            />
            <Bar dataKey="A" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Variant A" />
            <Bar dataKey="B" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Variant B" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
