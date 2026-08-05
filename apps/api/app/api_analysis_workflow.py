from .api_analyzer import analyze_with_openai, parse_openapi_document, replay_report, replay_response_report, summarize_openapi, summarize_response_json
from .config import get_settings
from .database import SessionLocal
from .models import ApiAnalysis, InvestigationStatus


def run_api_analysis(analysis_id: str) -> None:
    db = SessionLocal()
    item = db.get(ApiAnalysis, analysis_id)
    if not item:
        db.close()
        return
    try:
        item.status = InvestigationStatus.fetching_context
        db.commit()
        if item.input_type == "response":
            summary = summarize_response_json(item.document, item.purpose, item.method, item.path, item.known_contract)
        else:
            summary = summarize_openapi(parse_openapi_document(item.document))
        item.status = InvestigationStatus.analyzing
        db.commit()
        if item.mode == "replay":
            report = replay_response_report(summary, item.locale) if item.input_type == "response" else replay_report(summary, item.locale)
            tokens = 0
        else:
            report, tokens = analyze_with_openai(summary, item.locale, get_settings())
        item.report = report.model_dump(mode="json")
        item.token_usage = tokens
        item.status = InvestigationStatus.waiting_approval
    except Exception as exc:
        item.status = InvestigationStatus.failed
        item.error = str(exc)[:1000]
    finally:
        # The source contract is needed only while the background analysis runs.
        # Avoid retaining potentially sensitive examples or descriptions.
        item.document = ""
        item.known_contract = ""
        db.commit()
        db.close()
