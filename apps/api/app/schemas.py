from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class Citation(BaseModel):
    url: HttpUrl
    label: str
    kind: Literal["file", "issue", "pull_request", "workflow", "inference"]


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


class InvestigationReport(BaseModel):
    requirement_summary: str
    clarification_questions: list[str]
    impacted_files: list[ImpactedFile]
    implementation_tasks: list[ImplementationTask]
    acceptance_criteria: list[str]
    risks: list[RiskItem]
    confidence: Confidence

    @model_validator(mode="after")
    def validate_grounding(self):
        for item in [*self.impacted_files, *self.implementation_tasks, *self.risks]:
            if not item.citations:
                raise ValueError("Every finding must include at least one citation")
        return self


class InvestigationCreate(BaseModel):
    repository: str = Field(pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
    issue_number: int = Field(gt=0)
    branch: str = Field(default="main", min_length=1, max_length=120)
    include_pull_requests: bool = True
    mode: Literal["replay", "live"] = "replay"


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

