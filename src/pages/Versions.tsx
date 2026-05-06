import { useExperimentData } from '../hooks/useExperimentData'
import VersionTimeline from '../components/VersionTimeline'

export default function Versions() {
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
        <p>Failed to load version data: {error}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Version History
        </h1>
        <p className="mt-2 text-gray-400">
          {data.experiments.length} weeks of autonomous evolution. Each entry
          marks a new version of the game, shaped entirely by data.
        </p>
      </div>

      <VersionTimeline experiments={data.experiments} />
    </div>
  )
}
