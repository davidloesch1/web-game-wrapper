import { Link } from 'react-router-dom'
import Hero from '../components/Hero'
import HowItWorks from '../components/HowItWorks'
import ExperienceSelector from '../components/ExperienceSelector'
import { useExperimentData } from '../hooks/useExperimentData'

export default function Home() {
  const { data } = useExperimentData()

  const currentExperiment = data?.experiments.find(
    (e) => e.week === data.currentWeek,
  )

  const totalWeeks = data?.currentWeek ?? 1

  return (
    <>
      <Hero />
      <HowItWorks />
      <ExperienceSelector currentExperiment={currentExperiment} />

      {/* Version timeline teaser */}
      <section className="border-t border-gray-800 py-20">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Watch It Evolve</h2>
          <p className="mx-auto mt-3 max-w-lg text-gray-400">
            Every week produces a new version. Browse the full history to see
            how the game has transformed from its humble beginnings.
          </p>

          {/* Mini timeline preview */}
          <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-6">
            {data?.experiments
              .sort((a, b) => a.week - b.week)
              .slice(-5)
              .map((exp) => (
                <div key={exp.week} className="flex flex-col items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${
                      exp.week === totalWeeks
                        ? 'bg-cyan-500 text-gray-950'
                        : 'border border-gray-700 text-gray-400'
                    }`}
                  >
                    {exp.week}
                  </div>
                  <span className="mt-2 text-[10px] text-gray-600">
                    {exp.week === totalWeeks ? 'Current' : `Wk ${exp.week}`}
                  </span>
                </div>
              )) ?? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-gray-950">
                1
              </div>
            )}
          </div>

          <Link
            to="/versions"
            className="mt-8 inline-block rounded-lg border border-gray-700 px-6 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white"
          >
            See Full History
          </Link>
        </div>
      </section>

      {/* Dashboard CTA */}
      <section className="border-t border-gray-800 py-20">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Peek Behind the Curtain</h2>
          <p className="mx-auto mt-3 max-w-lg text-gray-400">
            Explore the data that drives every experiment. See metrics, hypotheses,
            and results from every week since the game launched.
          </p>
          <Link
            to="/dashboard"
            className="mt-8 inline-block rounded-lg bg-cyan-500 px-8 py-3 text-sm font-semibold text-gray-950 shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-400"
          >
            Open Dashboard
          </Link>
        </div>
      </section>
    </>
  )
}
