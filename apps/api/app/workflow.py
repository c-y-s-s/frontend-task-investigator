import time
from datetime import datetime, timezone
from sqlalchemy import select
from .ai import OpenAIAnalyzer
from .config import get_settings
from .database import SessionLocal
from .github_client import GitHubClient
from .models import Investigation, InvestigationStatus, ToolCall, WorkflowStep
from .replay import REPLAY_CONTEXT, REPLAY_REPORT
from .schemas import InvestigationReport


STEP_DEFINITIONS = [
    ("read_issue", "Read GitHub Issue"),
    ("plan", "Plan investigation"),
    ("search_code", "Search repository"),
    ("read_files", "Inspect candidate files"),
    ("search_prs", "Find related pull requests"),
    ("check_ci", "Check workflow status"),
    ("analyze", "Generate grounded report"),
    ("approval", "Wait for human approval"),
]


def seed_steps(db, investigation: Investigation) -> None:
    investigation.steps = [WorkflowStep(position=index, key=key, label=label) for index, (key, label) in enumerate(STEP_DEFINITIONS)]
    db.commit()


def _step(db, investigation: Investigation, key: str, status: str, summary: str | None = None, duration_ms: int | None = None):
    step = db.scalar(select(WorkflowStep).where(WorkflowStep.investigation_id == investigation.id, WorkflowStep.key == key))
    if not step:
        return
    step.status = status
    step.summary = summary
    if status == "running":
        step.started_at = datetime.now(timezone.utc)
    if status == "completed":
        step.completed_at = datetime.now(timezone.utc)
        step.duration_ms = duration_ms
    db.commit()


def _record_tool(db, investigation: Investigation, name: str, input_summary: dict, output_summary: dict, duration_ms: int):
    db.add(ToolCall(investigation_id=investigation.id, tool_name=name, input_summary=input_summary, output_summary=output_summary, duration_ms=duration_ms))
    db.commit()


def _run_tool(db, investigation, step_key, tool_name, fn, input_summary):
    _step(db, investigation, step_key, "running")
    started = time.perf_counter()
    result = fn()
    duration = int((time.perf_counter() - started) * 1000)
    count = len(result) if isinstance(result, list) else 1
    _record_tool(db, investigation, tool_name, input_summary, {"items": count}, duration)
    _step(db, investigation, step_key, "completed", f"Retrieved {count} result{'s' if count != 1 else ''}", duration)
    return result


def run_investigation(investigation_id: str) -> None:
    settings = get_settings()
    db = SessionLocal()
    investigation = db.get(Investigation, investigation_id)
    if not investigation:
        db.close()
        return
    try:
        investigation.status = InvestigationStatus.planning
        db.commit()
        if investigation.mode == "replay":
            _run_replay(db, investigation)
        else:
            _run_live(db, investigation, settings)
    except Exception as exc:
        investigation.status = InvestigationStatus.failed
        investigation.error = str(exc)[:1000]
        for step in investigation.steps:
            if step.status == "running":
                step.status = "failed"
                step.summary = investigation.error
        db.commit()
    finally:
        db.close()


def _run_replay(db, investigation: Investigation):
    replay_steps = [
        ("read_issue", "get_issue", {"issue_number": investigation.issue_number}, {"items": 1}, 318, "Loaded Issue #128"),
        ("plan", None, {}, {}, 744, "Selected payment, retry, checkout, and idempotency search terms"),
        ("search_code", "search_repository", {"terms": ["payment", "retry", "checkout"]}, {"items": 12}, 891, "Found 12 candidates"),
        ("read_files", "read_repository_files", {"paths": REPLAY_CONTEXT["files"]}, {"items": 4}, 1240, "Inspected 4 relevant files"),
        ("search_prs", "search_pull_requests", {"terms": ["payment", "checkout"]}, {"items": 2}, 522, "Found 2 related PRs"),
        ("check_ci", "get_workflow_runs", {"branch": investigation.branch}, {"items": 5}, 286, "Latest workflow passed"),
        ("analyze", "openai_responses", {"model": "replay"}, {"structured": True}, 1834, "Generated 3 tasks and 3 risks"),
    ]
    for key, tool, input_summary, output_summary, duration, summary in replay_steps:
        _step(db, investigation, key, "running")
        if tool:
            db.add(ToolCall(investigation_id=investigation.id, tool_name=tool, input_summary=input_summary, output_summary=output_summary, duration_ms=duration))
        _step(db, investigation, key, "completed", summary, duration)
    investigation.report = InvestigationReport.model_validate(REPLAY_REPORT).model_dump(mode="json")
    investigation.status = InvestigationStatus.waiting_approval
    investigation.token_usage = 2842
    investigation.estimated_cost_usd = "0.03"
    _step(db, investigation, "approval", "running", "Review the draft before approval")
    db.commit()


def _run_live(db, investigation: Investigation, settings):
    github = GitHubClient(settings)
    analyzer = OpenAIAnalyzer(settings)
    investigation.status = InvestigationStatus.fetching_context
    db.commit()
    issue = _run_tool(db, investigation, "read_issue", "get_issue", lambda: github.get_issue(investigation.repository, investigation.issue_number), {"repository": investigation.repository, "issue_number": investigation.issue_number})

    _step(db, investigation, "plan", "running")
    plan_started = time.perf_counter()
    search_plan, planning_tokens = analyzer.plan_search(issue)
    plan_duration = int((time.perf_counter() - plan_started) * 1000)
    terms = list(dict.fromkeys(term.strip() for term in search_plan.search_terms if term.strip()))[:6]
    path_hints = list(dict.fromkeys(hint.strip() for hint in search_plan.path_hints if hint.strip()))[:4]
    investigation_terms = list(dict.fromkeys([*terms, *path_hints]))
    _record_tool(
        db,
        investigation,
        "openai_plan_search",
        {"model": settings.openai_model, "issue_number": investigation.issue_number},
        {"search_terms": terms, "path_hints": path_hints, "rationale": search_plan.rationale, "tokens": planning_tokens},
        plan_duration,
    )
    _step(db, investigation, "plan", "completed", f"Search terms: {', '.join(terms)}", plan_duration)
    files = _run_tool(
        db,
        investigation,
        "search_code",
        "search_repository",
        lambda: github.search_repository(investigation.repository, investigation.branch, investigation_terms),
        {"branch": investigation.branch, "terms": investigation_terms},
    )
    contents = _run_tool(db, investigation, "read_files", "read_repository_files", lambda: github.read_repository_files(investigation.repository, investigation.branch, [item["path"] for item in files]), {"file_count": len(files)})
    prs = []
    if investigation.include_pull_requests:
        prs = _run_tool(db, investigation, "search_prs", "search_pull_requests", lambda: github.search_pull_requests(investigation.repository, terms), {"terms": terms[:3]})
    else:
        _step(db, investigation, "search_prs", "completed", "Skipped by request", 0)
    workflows = _run_tool(db, investigation, "check_ci", "get_workflow_runs", lambda: github.get_workflow_runs(investigation.repository, investigation.branch), {"branch": investigation.branch})

    investigation.status = InvestigationStatus.analyzing
    db.commit()
    _step(db, investigation, "analyze", "running")
    started = time.perf_counter()
    report, report_tokens = analyzer.analyze(
        {"issue": issue, "candidate_files": contents, "related_pull_requests": prs, "workflow_runs": workflows},
        locale=investigation.locale,
    )
    duration = int((time.perf_counter() - started) * 1000)
    _record_tool(db, investigation, "openai_responses", {"model": settings.openai_model, "files": len(contents), "locale": investigation.locale}, {"structured": True, "tokens": report_tokens}, duration)
    _step(db, investigation, "analyze", "completed", f"Generated {len(report.implementation_tasks)} tasks and {len(report.risks)} risks", duration)
    investigation.report = report.model_dump(mode="json")
    investigation.token_usage = planning_tokens + report_tokens
    investigation.status = InvestigationStatus.waiting_approval
    _step(db, investigation, "approval", "running", "Review the draft before approval")
    db.commit()
