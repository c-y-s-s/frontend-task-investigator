from datetime import datetime
from typing import Literal
from urllib.parse import urlparse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Citation(BaseModel):
    # Keep the model-facing JSON Schema to a plain string. OpenAI Structured
    # Outputs rejects Pydantic's `format: uri`, so URL safety is enforced after
    # parsing instead of encoded as a JSON Schema format.
    url: str
    label: str
    kind: Literal["file", "issue", "pull_request", "workflow", "inference"]

    @field_validator("url")
    @classmethod
    def validate_http_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Citation URL must be an absolute HTTP(S) URL")
        return value


class SearchPlan(BaseModel):
    search_terms: list[str] = Field(min_length=2, max_length=6)
    path_hints: list[str] = Field(max_length=4)
    rationale: str


class ImpactedFile(BaseModel):
    path: str
    reason: str
    risk_level: Literal["low", "medium", "high"]
    citations: list[Citation] = Field(min_length=1)


class ImplementationTask(BaseModel):
    title: str
    description: str
    affected_files: list[str]
    acceptance_criteria: list[str]
    citations: list[Citation] = Field(min_length=1)


class RiskItem(BaseModel):
    title: str
    severity: Literal["low", "medium", "high"]
    explanation: str
    evidence_type: Literal["direct", "inference"]
    citations: list[Citation] = Field(min_length=1)


class Confidence(BaseModel):
    level: Literal["low", "medium", "high"]
    reason: str


class RepositoryEvidence(BaseModel):
    kind: Literal["pull_request", "workflow"]
    title: str
    summary: str
    relevance: str
    citations: list[Citation] = Field(min_length=1)


class InvestigationReport(BaseModel):
    requirement_summary: str
    clarification_questions: list[str]
    repository_evidence: list[RepositoryEvidence]
    impacted_files: list[ImpactedFile]
    implementation_tasks: list[ImplementationTask]
    acceptance_criteria: list[str]
    risks: list[RiskItem]
    confidence: Confidence

    @model_validator(mode="after")
    def validate_grounding(self):
        for item in [*self.repository_evidence, *self.impacted_files, *self.implementation_tasks, *self.risks]:
            if not item.citations:
                raise ValueError("Every finding must include at least one citation")
        return self


class InvestigationCreate(BaseModel):
    repository: str = Field(pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
    issue_number: int = Field(gt=0)
    branch: str = Field(default="main", min_length=1, max_length=120)
    include_pull_requests: bool = True
    mode: Literal["replay", "live"] = "replay"
    locale: Literal["zh-TW", "en"] = "zh-TW"


class ApprovalRequest(BaseModel):
    report: InvestigationReport | None = None
    actor: str = Field(default="demo-user", max_length=120)


class RejectionRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)
    actor: str = Field(default="demo-user", max_length=120)


class WorkflowStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    position: int
    key: str
    label: str
    status: str
    summary: str | None
    duration_ms: int | None


class ToolCallRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    tool_name: str
    input_summary: dict
    output_summary: dict
    success: bool
    duration_ms: int


class InvestigationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    repository: str
    issue_number: int
    branch: str
    include_pull_requests: bool
    mode: str
    locale: str
    status: str
    report: InvestigationReport | None
    approved_report: InvestigationReport | None
    error: str | None
    token_usage: int
    estimated_cost_usd: str
    created_at: datetime
    updated_at: datetime
    steps: list[WorkflowStepRead]
    tool_calls: list[ToolCallRead]


class ApiAnalysisCreate(BaseModel):
    document: str = Field(min_length=20, max_length=500_000)
    input_type: Literal["response", "openapi"] = "response"
    purpose: str = Field(default="", max_length=500)
    known_contract: str = Field(default="", max_length=2_000)
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] | None = None
    path: str | None = Field(default=None, max_length=300)
    mode: Literal["replay", "live"] = "replay"
    locale: Literal["zh-TW", "en"] = "zh-TW"


class ApiEndpoint(BaseModel):
    method: str
    path: str
    summary: str
    operation_id: str | None = None
    authentication: list[str]
    request_fields: list[str]
    responses: list[str]


class ApiFinding(BaseModel):
    category: Literal["error", "pagination", "authentication", "schema", "frontend"]
    severity: Literal["low", "medium", "high"]
    title: str
    explanation: str
    location: str


class ResponseField(BaseModel):
    path: str
    inferred_type: str
    nullable: bool


class ApiAnalysisReport(BaseModel):
    analysis_type: Literal["response", "openapi"]
    api_title: str
    api_version: str
    summary: str
    endpoints: list[ApiEndpoint]
    findings: list[ApiFinding]
    clarification_questions: list[str]
    frontend_checklist: list[str]
    response_fields: list[ResponseField]
    typescript_draft: str
    privacy_warnings: list[str]
    contract_notes_used: list[str]
    confidence: Confidence


class ApiAnalysisRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    input_type: str
    purpose: str
    method: str | None
    path: str | None
    mode: str
    locale: str
    status: str
    report: ApiAnalysisReport | None
    approved_report: ApiAnalysisReport | None
    error: str | None
    token_usage: int
    created_at: datetime
    updated_at: datetime


class ApiAnalysisApproval(BaseModel):
    report: ApiAnalysisReport | None = None
    actor: str = Field(default="demo-user", max_length=120)


class BugInvestigationCreate(BaseModel):
    title: str = Field(min_length=5, max_length=300)
    repository: str = Field(pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
    branch: str = Field(default="main", min_length=1, max_length=120)
    error_message: str = Field(min_length=5, max_length=5_000)
    console_log: str = Field(default="", max_length=20_000)
    network_context: str = Field(default="", max_length=20_000)
    expected_behavior: str = Field(default="", max_length=2_000)
    mode: Literal["replay", "live"] = "replay"
    locale: Literal["zh-TW", "en"] = "zh-TW"


class BugEvidence(BaseModel):
    source: Literal["input", "file", "pull_request"]
    observation: str
    citation: Citation | None = None


class BugHypothesis(BaseModel):
    rank: int = Field(ge=1, le=3)
    title: str
    explanation: str
    confidence: Literal["low", "medium", "high"]
    evidence: list[BugEvidence] = Field(min_length=1)


class VerificationAction(BaseModel):
    order: int = Field(ge=1, le=6)
    action: str
    expected_signal: str
    related_hypothesis_rank: int = Field(ge=1, le=3)


class BugInvestigationReport(BaseModel):
    bug_summary: str
    observed_facts: list[str]
    hypotheses: list[BugHypothesis] = Field(min_length=1, max_length=3)
    verification_actions: list[VerificationAction] = Field(min_length=1, max_length=6)
    missing_information: list[str]
    affected_files: list[ImpactedFile]
    stop_condition: str
    confidence: Confidence


class BugInvestigationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    repository: str
    branch: str
    mode: str
    locale: str
    status: str
    steps: list[dict]
    tool_calls: list[dict]
    report: BugInvestigationReport | None
    approved_report: BugInvestigationReport | None
    error: str | None
    token_usage: int
    created_at: datetime
    updated_at: datetime


class BugInvestigationApproval(BaseModel):
    report: BugInvestigationReport | None = None
    actor: str = Field(default="demo-user", max_length=120)
