import { Link } from 'react-router-dom'

export default function Hero() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      {/* Gradient glow behind hero */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 text-center">
        <p className="mb-4 inline-block rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-cyan-400">
          Live Experiment
        </p>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          This game{' '}
          <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            builds itself.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400">
          Every week, AI analyzes player behavior, designs an experiment, and
          advances the winner. No human touches the code &mdash; the game
          evolves on its own.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="#play"
            className="rounded-lg bg-cyan-500 px-8 py-3 text-sm font-semibold text-gray-950 shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-400"
          >
            Play Now
          </a>
          <Link
            to="/dashboard"
            className="rounded-lg border border-gray-700 px-8 py-3 text-sm font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white"
          >
            View Dashboard
          </Link>
        </div>
      </div>
    </section>
  )
}
