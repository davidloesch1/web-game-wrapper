import type { Experiment } from '../types/experiment'

interface Props {
  experiment: Experiment
  goal: string
}

export default function ExperimentCard({ experiment, goal }: Props) {
  const isRunning = experiment.status === 'running'

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold">
          Week {experiment.week} &mdash; Current Experiment
        </h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isRunning
              ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/30'
              : 'bg-gray-700 text-gray-300'
          }`}
        >
          {isRunning ? 'Running' : 'Complete'}
        </span>
      </div>

      <div className="mb-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-500">
          Highest-Order Goal
        </p>
        <p className="mt-1 text-sm font-medium text-cyan-300">{goal}</p>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <span className="text-gray-500">Hypothesis:</span>
          <p className="mt-0.5 text-gray-300">{experiment.hypothesis}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-500">Variant A:</span>
            <p className="mt-0.5 text-gray-300">{experiment.variantA}</p>
          </div>
          <div>
            <span className="text-gray-500">Variant B:</span>
            <p className="mt-0.5 text-gray-300">{experiment.variantB}</p>
          </div>
        </div>
        <div className="flex gap-6 text-xs text-gray-500">
          <span>Start: {experiment.startDate}</span>
          <span>End: {experiment.endDate}</span>
        </div>
      </div>
    </div>
  )
}
