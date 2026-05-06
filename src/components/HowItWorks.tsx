const steps = [
  {
    number: '01',
    title: 'Analyze',
    description:
      'Each week, AI reviews player sessions, engagement metrics, and behavioral patterns from the previous version.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Experiment',
    description:
      'A single A/B experiment is designed with a clear hypothesis. Half the players see variant A, half see variant B.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M5 14.5l-1.455 1.455A2.25 2.25 0 006.879 20h10.242a2.25 2.25 0 003.334-3.045L19 14.5" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Evolve',
    description:
      'The winning variant becomes the new baseline. The game advances, and the cycle repeats — forever improving.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
      </svg>
    ),
  },
]

export default function HowItWorks() {
  return (
    <section className="border-t border-gray-800 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">How It Works</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-gray-400">
          A fully automated loop of data analysis, experimentation, and evolution.
        </p>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="group rounded-xl border border-gray-800 bg-gray-900/50 p-8 transition hover:border-cyan-500/40 hover:bg-gray-900"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 transition group-hover:bg-cyan-500/20">
                {step.icon}
              </div>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-cyan-500">
                Step {step.number}
              </p>
              <h3 className="mb-2 text-xl font-bold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-gray-400">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
