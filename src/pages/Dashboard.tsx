import { useExperimentData } from '../hooks/useExperimentData'
import ExperimentCard from '../components/ExperimentCard'
import ExperimentTable from '../components/ExperimentTable'
import MetricChart from '../components/MetricChart'

export default function Dashboard() {
  const { data, loading, error } = useExperimentData()

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-red-400">
        <p>Failed to load experiment data: {error}</p>
      </div>
    )
  }

  const currentExperiment = data.experiments.find(
    (e) => e.week === data.currentWeek,
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Experiment Dashboard
        </h1>
        <p className="mt-2 text-gray-400">
          Week {data.currentWeek} &mdash; tracking{' '}
          <span className="text-cyan-400">{data.experiments.length}</span>{' '}
          experiments toward the goal.
        </p>
      </div>

      {/* Current experiment */}
      {currentExperiment && (
        <div className="mb-10">
          <ExperimentCard experiment={currentExperiment} goal={data.goal} />
        </div>
      )}

      {/* Charts */}
      <div className="mb-10">
        <h2 className="mb-4 text-xl font-bold">Metrics</h2>
        <MetricChart experiments={data.experiments} />
      </div>

      {/* Experiment history table */}
      <div>
        <h2 className="mb-4 text-xl font-bold">Experiment History</h2>
        <ExperimentTable experiments={data.experiments} />
      </div>
    </div>
  )
}
