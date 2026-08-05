import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload
from .config import get_settings
from .database import Base, engine, get_db
from .api_analysis_workflow import run_api_analysis
from .bug_workflow import initial_steps, run_bug_investigation
from .code_review_workflow import initial_steps as review_steps, run_code_review
from .models import ApiAnalysis, AuditLog, BugInvestigation, CodeReview, Investigation, InvestigationStatus
from .schemas import ApiAnalysisApproval, ApiAnalysisCreate, ApiAnalysisRead, ApprovalRequest, BugInvestigationApproval, BugInvestigationCreate, BugInvestigationRead, CodeReviewApproval, CodeReviewCreate, CodeReviewRead, HistoryItem, InvestigationCreate, InvestigationRead, RejectionRequest
from .workflow import run_investigation, seed_steps


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def query_investigation(db: Session, investigation_id: str) -> Investigation:
    item = db.scalar(select(Investigation).options(selectinload(Investigation.steps), selectinload(Investigation.tool_calls)).where(Investigation.id == investigation_id))
    if not item:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return item


def enforce_live_limits(db: Session, requester_ip: str, repository: str) -> None:
    if repository.lower() not in settings.allowed_repos:
        raise HTTPException(status_code=403, detail="Repository is not allowed in live mode")
    day_start = datetime.now(timezone.utc) - timedelta(days=1)
    hour_start = datetime.now(timezone.utc) - timedelta(hours=1)
    daily = db.scalar(select(func.count()).select_from(Investigation).where(Investigation.mode == "live", Investigation.created_at >= day_start)) or 0
    hourly = db.scalar(select(func.count()).select_from(Investigation).where(Investigation.mode == "live", Investigation.requester_ip == requester_ip, Investigation.created_at >= hour_start)) or 0
    if daily >= settings.daily_live_limit:
        raise HTTPException(status_code=429, detail="Daily live analysis limit reached; use Replay mode")
    if hourly >= settings.per_ip_hourly_limit:
        raise HTTPException(status_code=429, detail="Hourly live analysis limit reached; use Replay mode")


@app.get("/health")
def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/v1/history", response_model=list[HistoryItem])
def get_history(db: Session = Depends(get_db)):
    """Return bounded, non-sensitive workflow metadata for the portfolio UI."""
    limit_per_kind = 50
    items: list[HistoryItem] = []

    for item in db.scalars(select(Investigation).order_by(Investigation.created_at.desc()).limit(limit_per_kind)):
        items.append(HistoryItem(id=item.id, kind="task", target=f"{item.repository} · Issue #{item.issue_number}", mode=item.mode, locale=item.locale, status=item.status.value, token_usage=item.token_usage, approved=item.approved_report is not None, created_at=item.created_at, detail_path=f"/api/v1/investigations/{item.id}"))
    for item in db.scalars(select(ApiAnalysis).order_by(ApiAnalysis.created_at.desc()).limit(limit_per_kind)):
        endpoint = " ".join(value for value in [item.method, item.path] if value)
        items.append(HistoryItem(id=item.id, kind="api", target=endpoint or item.purpose or "API analysis", mode=item.mode, locale=item.locale, status=item.status.value, token_usage=item.token_usage, approved=item.approved_report is not None, created_at=item.created_at, detail_path=f"/api/v1/api-analyses/{item.id}"))
    for item in db.scalars(select(BugInvestigation).order_by(BugInvestigation.created_at.desc()).limit(limit_per_kind)):
        items.append(HistoryItem(id=item.id, kind="bug", target=f"{item.repository} · {item.title}", mode=item.mode, locale=item.locale, status=item.status.value, token_usage=item.token_usage, approved=item.approved_report is not None, created_at=item.created_at, detail_path=f"/api/v1/bug-investigations/{item.id}"))
    for item in db.scalars(select(CodeReview).order_by(CodeReview.created_at.desc()).limit(limit_per_kind)):
        items.append(HistoryItem(id=item.id, kind="review", target=f"{item.repository} · PR #{item.pull_request_number}", mode=item.mode, locale=item.locale, status=item.status.value, token_usage=item.token_usage, approved=item.approved_report is not None, created_at=item.created_at, detail_path=f"/api/v1/code-reviews/{item.id}"))

    return sorted(items, key=lambda item: item.created_at, reverse=True)[:50]


def query_api_analysis(db: Session, analysis_id: str) -> ApiAnalysis:
    item = db.get(ApiAnalysis, analysis_id)
    if not item:
        raise HTTPException(status_code=404, detail="API analysis not found")
    return item


def query_bug_investigation(db: Session, investigation_id: str) -> BugInvestigation:
    item = db.get(BugInvestigation, investigation_id)
    if not item:
        raise HTTPException(status_code=404, detail="Bug investigation not found")
    return item

def query_code_review(db: Session, review_id: str) -> CodeReview:
    item = db.get(CodeReview, review_id)
    if not item: raise HTTPException(status_code=404, detail="Code review not found")
    return item

@app.post("/api/v1/code-reviews", response_model=CodeReviewRead, status_code=202)
def create_code_review(payload: CodeReviewCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if payload.mode == "live" and payload.repository.lower() not in settings.allowed_repos: raise HTTPException(status_code=403, detail="Repository is not allowed in live mode")
    item = CodeReview(**payload.model_dump(), steps=review_steps(payload.locale), tool_calls=[]); db.add(item); db.commit(); background_tasks.add_task(run_code_review, item.id); return query_code_review(db,item.id)

@app.get("/api/v1/code-reviews/{review_id}", response_model=CodeReviewRead)
def get_code_review(review_id: str, db: Session = Depends(get_db)): return query_code_review(db,review_id)

@app.get("/api/v1/code-reviews/{review_id}/events")
async def code_review_events(review_id: str):
    async def stream():
        previous=None
        while True:
            from .database import SessionLocal
            with SessionLocal() as db:
                payload=CodeReviewRead.model_validate(query_code_review(db,review_id)).model_dump(mode="json")
            encoded=json.dumps(payload)
            if encoded != previous: yield f"event: review\ndata: {encoded}\n\n"; previous=encoded
            if payload["status"] in {"waiting_approval","approved","rejected","failed"}: yield "event: done\ndata: {}\n\n"; return
            await asyncio.sleep(.5)
    return StreamingResponse(stream(),media_type="text/event-stream",headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.post("/api/v1/code-reviews/{review_id}/approve",response_model=CodeReviewRead)
def approve_code_review(review_id: str,payload: CodeReviewApproval,db: Session=Depends(get_db)):
    item=query_code_review(db,review_id)
    if item.status != InvestigationStatus.waiting_approval: raise HTTPException(status_code=409,detail="Only a waiting draft can be approved")
    item.approved_report=payload.report.model_dump(mode="json") if payload.report else item.report; item.status=InvestigationStatus.approved; db.commit(); return item

@app.post("/api/v1/code-reviews/{review_id}/reject",response_model=CodeReviewRead)
def reject_code_review(review_id: str,payload: RejectionRequest,db: Session=Depends(get_db)):
    item=query_code_review(db,review_id)
    if item.status != InvestigationStatus.waiting_approval: raise HTTPException(status_code=409,detail="Only a waiting draft can be rejected")
    item.status=InvestigationStatus.rejected; item.rejection_reason=payload.reason; db.commit(); return item


@app.post("/api/v1/bug-investigations", response_model=BugInvestigationRead, status_code=202)
def create_bug_investigation(payload: BugInvestigationCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if payload.mode == "live" and payload.repository.lower() not in settings.allowed_repos:
        raise HTTPException(status_code=403, detail="Repository is not allowed in live mode")
    item = BugInvestigation(**payload.model_dump(), steps=initial_steps(payload.locale), tool_calls=[])
    db.add(item); db.commit()
    background_tasks.add_task(run_bug_investigation, item.id)
    return query_bug_investigation(db, item.id)


@app.get("/api/v1/bug-investigations/{investigation_id}", response_model=BugInvestigationRead)
def get_bug_investigation(investigation_id: str, db: Session = Depends(get_db)):
    return query_bug_investigation(db, investigation_id)


@app.get("/api/v1/bug-investigations/{investigation_id}/events")
async def bug_investigation_events(investigation_id: str):
    async def stream():
        previous = None
        while True:
            from .database import SessionLocal
            with SessionLocal() as db:
                try:
                    payload = BugInvestigationRead.model_validate(query_bug_investigation(db, investigation_id)).model_dump(mode="json")
                except HTTPException:
                    yield 'event: error\ndata: {"detail":"Bug investigation not found"}\n\n'; return
            encoded = json.dumps(payload)
            if encoded != previous:
                yield f"event: investigation\ndata: {encoded}\n\n"; previous = encoded
            if payload["status"] in {"waiting_approval", "approved", "rejected", "failed"}:
                yield "event: done\ndata: {}\n\n"; return
            await asyncio.sleep(0.5)
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/v1/bug-investigations/{investigation_id}/approve", response_model=BugInvestigationRead)
def approve_bug_investigation(investigation_id: str, payload: BugInvestigationApproval, db: Session = Depends(get_db)):
    item = query_bug_investigation(db, investigation_id)
    if item.status != InvestigationStatus.waiting_approval:
        raise HTTPException(status_code=409, detail="Only a waiting draft can be approved")
    item.approved_report = payload.report.model_dump(mode="json") if payload.report else item.report
    item.status = InvestigationStatus.approved
    steps = [dict(step) for step in item.steps]
    for step in steps:
        if step["key"] == "approval": step.update(status="completed", summary="已由人工核准")
    item.steps = steps; db.commit()
    return item


@app.post("/api/v1/bug-investigations/{investigation_id}/reject", response_model=BugInvestigationRead)
def reject_bug_investigation(investigation_id: str, payload: RejectionRequest, db: Session = Depends(get_db)):
    item = query_bug_investigation(db, investigation_id)
    if item.status != InvestigationStatus.waiting_approval:
        raise HTTPException(status_code=409, detail="Only a waiting draft can be rejected")
    item.status = InvestigationStatus.rejected
    item.rejection_reason = payload.reason
    db.commit()
    return item


@app.post("/api/v1/api-analyses", response_model=ApiAnalysisRead, status_code=202)
def create_api_analysis(payload: ApiAnalysisCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    item = ApiAnalysis(**payload.model_dump())
    db.add(item)
    db.commit()
    background_tasks.add_task(run_api_analysis, item.id)
    return query_api_analysis(db, item.id)


@app.get("/api/v1/api-analyses/{analysis_id}", response_model=ApiAnalysisRead)
def get_api_analysis(analysis_id: str, db: Session = Depends(get_db)):
    return query_api_analysis(db, analysis_id)


@app.get("/api/v1/api-analyses/{analysis_id}/events")
async def api_analysis_events(analysis_id: str):
    async def stream():
        previous = None
        while True:
            from .database import SessionLocal
            with SessionLocal() as db:
                try:
                    payload = ApiAnalysisRead.model_validate(query_api_analysis(db, analysis_id)).model_dump(mode="json")
                except HTTPException:
                    yield "event: error\ndata: {\"detail\":\"API analysis not found\"}\n\n"
                    return
            encoded = json.dumps(payload)
            if encoded != previous:
                yield f"event: analysis\ndata: {encoded}\n\n"
                previous = encoded
            if payload["status"] in {"waiting_approval", "approved", "rejected", "failed"}:
                yield "event: done\ndata: {}\n\n"
                return
            await asyncio.sleep(0.5)
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/v1/api-analyses/{analysis_id}/approve", response_model=ApiAnalysisRead)
def approve_api_analysis(analysis_id: str, payload: ApiAnalysisApproval, db: Session = Depends(get_db)):
    item = query_api_analysis(db, analysis_id)
    if item.status != InvestigationStatus.waiting_approval:
        raise HTTPException(status_code=409, detail="Only a waiting draft can be approved")
    item.approved_report = payload.report.model_dump(mode="json") if payload.report else item.report
    item.status = InvestigationStatus.approved
    db.commit()
    return item


@app.post("/api/v1/api-analyses/{analysis_id}/reject", response_model=ApiAnalysisRead)
def reject_api_analysis(analysis_id: str, payload: RejectionRequest, db: Session = Depends(get_db)):
    item = query_api_analysis(db, analysis_id)
    if item.status != InvestigationStatus.waiting_approval:
        raise HTTPException(status_code=409, detail="Only a waiting draft can be rejected")
    item.status = InvestigationStatus.rejected
    db.commit()
    return item


@app.post("/api/v1/investigations", response_model=InvestigationRead, status_code=202)
def create_investigation(payload: InvestigationCreate, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    requester_ip = request.client.host if request.client else "unknown"
    if payload.mode == "live":
        enforce_live_limits(db, requester_ip, payload.repository)
    item = Investigation(**payload.model_dump(), requester_ip=requester_ip)
    db.add(item)
    db.commit()
    seed_steps(db, item)
    background_tasks.add_task(run_investigation, item.id)
    return query_investigation(db, item.id)


@app.get("/api/v1/investigations/{investigation_id}", response_model=InvestigationRead)
def get_investigation(investigation_id: str, db: Session = Depends(get_db)):
    return query_investigation(db, investigation_id)


@app.get("/api/v1/investigations/{investigation_id}/events")
async def investigation_events(investigation_id: str):
    async def stream():
        previous = None
        while True:
            from .database import SessionLocal
            with SessionLocal() as db:
                try:
                    item = query_investigation(db, investigation_id)
                    payload = InvestigationRead.model_validate(item).model_dump(mode="json")
                except HTTPException:
                    yield "event: error\ndata: {\"detail\":\"Investigation not found\"}\n\n"
                    return
            encoded = json.dumps(payload)
            if encoded != previous:
                yield f"event: investigation\ndata: {encoded}\n\n"
                previous = encoded
            if payload["status"] in {"waiting_approval", "approved", "rejected", "failed"}:
                yield "event: done\ndata: {}\n\n"
                return
            await asyncio.sleep(0.75)
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/v1/investigations/{investigation_id}/approve", response_model=InvestigationRead)
def approve_investigation(investigation_id: str, payload: ApprovalRequest, db: Session = Depends(get_db)):
    item = query_investigation(db, investigation_id)
    if item.status != InvestigationStatus.waiting_approval:
        raise HTTPException(status_code=409, detail="Only a waiting draft can be approved")
    item.approved_report = payload.report.model_dump(mode="json") if payload.report else item.report
    item.status = InvestigationStatus.approved
    db.add(AuditLog(investigation_id=item.id, action="approved", actor=payload.actor, detail={"edited": payload.report is not None}))
    for step in item.steps:
        if step.key == "approval":
            step.status = "completed"
            step.summary = "Draft approved by human reviewer"
    db.commit()
    return query_investigation(db, item.id)


@app.post("/api/v1/investigations/{investigation_id}/reject", response_model=InvestigationRead)
def reject_investigation(investigation_id: str, payload: RejectionRequest, db: Session = Depends(get_db)):
    item = query_investigation(db, investigation_id)
    if item.status != InvestigationStatus.waiting_approval:
        raise HTTPException(status_code=409, detail="Only a waiting draft can be rejected")
    item.status = InvestigationStatus.rejected
    db.add(AuditLog(investigation_id=item.id, action="rejected", actor=payload.actor, detail={"reason": payload.reason}))
    for step in item.steps:
        if step.key == "approval":
            step.status = "completed"
            step.summary = f"Rejected: {payload.reason}"
    db.commit()
    return query_investigation(db, item.id)
