import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class InvestigationStatus(str, enum.Enum):
    queued = "queued"
    planning = "planning"
    fetching_context = "fetching_context"
    analyzing = "analyzing"
    waiting_approval = "waiting_approval"
    approved = "approved"
    rejected = "rejected"
    failed = "failed"


class Investigation(Base):
    __tablename__ = "investigations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repository: Mapped[str] = mapped_column(String(200), index=True)
    issue_number: Mapped[int] = mapped_column(Integer)
    branch: Mapped[str] = mapped_column(String(120), default="main")
    include_pull_requests: Mapped[bool] = mapped_column(default=True)
    mode: Mapped[str] = mapped_column(String(20), default="replay")
    locale: Mapped[str] = mapped_column(String(10), default="zh-TW")
    requester_ip: Mapped[str] = mapped_column(String(64), default="unknown")
    status: Mapped[InvestigationStatus] = mapped_column(
        Enum(InvestigationStatus), default=InvestigationStatus.queued, index=True
    )
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    approved_report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[str] = mapped_column(String(20), default="0.00")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    steps: Mapped[list["WorkflowStep"]] = relationship(
        back_populates="investigation", cascade="all, delete-orphan", order_by="WorkflowStep.position"
    )
    tool_calls: Mapped[list["ToolCall"]] = relationship(
        back_populates="investigation", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        back_populates="investigation", cascade="all, delete-orphan"
    )


class WorkflowStep(Base):
    __tablename__ = "workflow_steps"
    id: Mapped[int] = mapped_column(primary_key=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    position: Mapped[int]
    key: Mapped[str] = mapped_column(String(80))
    label: Mapped[str] = mapped_column(String(180))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    investigation: Mapped[Investigation] = relationship(back_populates="steps")


class ToolCall(Base):
    __tablename__ = "tool_calls"
    id: Mapped[int] = mapped_column(primary_key=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    tool_name: Mapped[str] = mapped_column(String(100))
    input_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    output_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    success: Mapped[bool] = mapped_column(default=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    investigation: Mapped[Investigation] = relationship(back_populates="tool_calls")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    action: Mapped[str] = mapped_column(String(80))
    actor: Mapped[str] = mapped_column(String(120), default="demo-user")
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    investigation: Mapped[Investigation] = relationship(back_populates="audit_logs")


class ApiAnalysis(Base):
    __tablename__ = "api_analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document: Mapped[str] = mapped_column(Text)
    input_type: Mapped[str] = mapped_column(String(20), default="response")
    purpose: Mapped[str] = mapped_column(String(500), default="")
    known_contract: Mapped[str] = mapped_column(Text, default="")
    method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    mode: Mapped[str] = mapped_column(String(20), default="replay")
    locale: Mapped[str] = mapped_column(String(10), default="zh-TW")
    status: Mapped[InvestigationStatus] = mapped_column(Enum(InvestigationStatus), default=InvestigationStatus.queued, index=True)
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    approved_report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class BugInvestigation(Base):
    __tablename__ = "bug_investigations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(300))
    repository: Mapped[str] = mapped_column(String(200), index=True)
    branch: Mapped[str] = mapped_column(String(120), default="main")
    error_message: Mapped[str] = mapped_column(Text)
    console_log: Mapped[str] = mapped_column(Text, default="")
    network_context: Mapped[str] = mapped_column(Text, default="")
    expected_behavior: Mapped[str] = mapped_column(Text, default="")
    mode: Mapped[str] = mapped_column(String(20), default="replay")
    locale: Mapped[str] = mapped_column(String(10), default="zh-TW")
    status: Mapped[InvestigationStatus] = mapped_column(Enum(InvestigationStatus), default=InvestigationStatus.queued, index=True)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    tool_calls: Mapped[list] = mapped_column(JSON, default=list)
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    approved_report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
