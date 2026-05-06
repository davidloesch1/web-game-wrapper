export interface ExperimentMetrics {
  a: number | null
  b: number | null
}

export interface Experiment {
  week: number
  status: 'running' | 'complete'
  hypothesis: string
  variantA: string
  variantB: string
  startDate: string
  endDate: string
  metrics: ExperimentMetrics
  winner: 'a' | 'b' | null
  changelog: string
  versionUrl: string | null
}

export interface ExperimentData {
  goal: string
  currentWeek: number
  experiments: Experiment[]
}
