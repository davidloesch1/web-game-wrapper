"""Structured output schemas for Gemini agent responses."""

from dataclasses import dataclass, field


@dataclass
class AnalysisReport:
    """Output from the Data Scientist agent."""
    summary: str
    player_clusters: list[dict]
    key_correlations: list[str]
    dropoff_patterns: list[str]
    ab_comparison: str | None
    recommendations: list[str]
    sample_size: int
    confidence_notes: str


@dataclass
class ExperimentProposal:
    """Output from the Product Manager agent."""
    hypothesis: str
    variant_a_description: str
    variant_b_description: str
    implementation_notes: str
    expected_impact: str
    risk_assessment: str
    measurable_criteria: str


@dataclass
class EthicsReview:
    """Output from the Ethics agent."""
    approved: bool
    concerns: list[str]
    reasoning: str


@dataclass
class JudgmentResult:
    """Output from the Judge agent."""
    score: int
    approved: bool
    alignment_reasoning: str
    feedback: str
    constraint_violations: list[str]


@dataclass
class ExperimentRecord:
    """A complete experiment entry for experiments.json."""
    week: int
    status: str
    hypothesis: str
    variant_a: str
    variant_b: str
    variant_a_url: str
    variant_b_url: str
    start_date: str
    end_date: str
    metrics_a: float | None = None
    metrics_b: float | None = None
    winner: str | None = None
    changelog: str = ""
    version_url: str | None = None


@dataclass
class PipelineState:
    """Tracks the state of a pipeline run for logging."""
    week: int
    stages_completed: list[str] = field(default_factory=list)
    analysis_report: AnalysisReport | None = None
    proposal: ExperimentProposal | None = None
    ethics_review: EthicsReview | None = None
    judgment: JudgmentResult | None = None
    final_status: str = "pending"
    error: str | None = None
