export interface FingerprintEvent {
  session_id: string
  user_id?: string
  event_name: string
  event_properties: Record<string, number> | string
  event_time: string
}

export type BehavioralState =
  | 'engaged'
  | 'confused'
  | 'frustrated'
  | 'exploring'
  | 'deliberate'
  | 'idle'
  | 'rushing'
  | 'learning'

export interface BehavioralScores {
  engaged?: number
  confused?: number
  frustrated?: number
  exploring?: number
  deliberate?: number
  idle?: number
  rushing?: number
  learning?: number
}

export interface FingerprintAnnotation {
  fingerprint_index: number
  timestamp_description: string
  primary_state: BehavioralState
  scores: BehavioralScores
}

export interface Archetype {
  primary: string
  confidence: number
  reasoning: string
  secondary?: string
}

export interface Intent {
  primary: string
  confidence: number
  reasoning: string
  fulfilled: boolean
  secondary?: string
}

export interface ValuePrediction {
  score: number
  will_return: boolean
  reasoning: string
}

export interface SessionSummary {
  session_id: string
  session_narrative: string
  fingerprint_annotations?: FingerprintAnnotation[]
  dominant_state?: BehavioralState
  archetype?: Archetype
  intent?: Intent
  value_prediction?: ValuePrediction
  frustration_signals?: string[]
  // Legacy fields (from old profile)
  initial_understanding?: 'none' | 'partial' | 'solid'
  final_understanding?: 'none' | 'partial' | 'solid' | 'advanced'
  learning_onset_seconds?: number
  learning_curve_stage?: 'confused' | 'learning' | 'competent' | 'advanced'
  understood_mechanics?: boolean
  learning_progression?: 'no_change' | 'progressed' | 'regressed' | 'mastered_quickly'
  engagement_quality?: 'bounce' | 'shallow' | 'moderate' | 'deep' | 'flow_state'
  functional_issues?: string[]
  design_gaps?: string[]
  experiment_variant?: string
}

export interface BehavioralSummary {
  total_profiled: number
  archetype_distribution?: Record<string, number>
  intent_distribution?: Record<string, number>
  intent_fulfilled_pct?: number
  dominant_state_distribution?: Record<string, number>
  fingerprint_state_distribution?: Record<string, number>
  value_prediction?: {
    mean_score: number | null
    will_return_pct: number
  }
}

export interface Projection {
  session_id: string
  x: number
  y: number
  event_time?: string
  fingerprint_index?: number
  fingerprint_count?: number
  experiment_variant?: string
  experiment_week?: number
}

export interface DashboardSession {
  session_id: string
  user_id?: string
  event_time: string
  duration_millis: number
  active_duration_millis: number
  total_clicks: number
  total_rage_clicks: number
  total_dead_clicks: number
  experiment_week?: number
  experiment_variant?: string
  url_host?: string
  user_agent_browser?: string
  user_agent_device?: string
  location_country?: string
  fingerprint_events: FingerprintEvent[]
  summary?: SessionSummary | null
  projection?: Projection | null
}

export interface LearningOnsetStats {
  count: number
  mean: number | null
  median: number | null
  p25: number | null
  p75: number | null
}

export interface UnderstandingShift {
  improved_pct: number
  flat_pct: number
  regressed_pct: number
  avg_shift: number
}

export interface LearningVelocity {
  learning_onset_seconds: LearningOnsetStats
  learning_progression_distribution: Record<string, number>
  mastered_quickly_pct: number
  understanding_shift: UnderstandingShift
}

export interface VariantBreakdown {
  count: number
  understood_mechanics_pct: number
  engagement_distribution: Record<string, number>
  initial_understanding_distribution: Record<string, number>
  final_understanding_distribution: Record<string, number>
  learning_velocity: LearningVelocity
}

export interface QualitativeReport {
  total_summarized: number
  understood_mechanics_pct: number
  initial_understanding_distribution: Record<string, number>
  final_understanding_distribution: Record<string, number>
  learning_curve_distribution: Record<string, number>
  engagement_distribution: Record<string, number>
  learning_velocity: LearningVelocity
  top_functional_issues: { issue: string; count: number }[]
  top_design_gaps: { issue: string; count: number }[]
  top_frustration_signals: { issue: string; count: number }[]
  variant_breakdown: Record<string, VariantBreakdown>
}

export interface DashboardData {
  generated_at: string
  total_sessions: number
  total_summarized: number
  qualitative_report: QualitativeReport
  behavioral_summary?: BehavioralSummary
  experiments: Array<{
    week: number
    status: string
    hypothesis: string
    variantA: string
    variantB: string
    startDate: string
    endDate: string
    winner: string | null
  }>
  goal: string
  current_week: number
  sessions: DashboardSession[]
  projections: Projection[]
  session_projections: Projection[]
}
