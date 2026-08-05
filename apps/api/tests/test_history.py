from app.database import SessionLocal
from app.models import ApiAnalysis, BugInvestigation, CodeReview, Investigation, InvestigationStatus


def test_history_returns_bounded_metadata_without_sensitive_inputs(client):
    with SessionLocal() as db:
        db.add(Investigation(repository="demo/shop", issue_number=7, status=InvestigationStatus.approved, approved_report={"ok": True}, token_usage=120))
        db.add(ApiAnalysis(document="sensitive response payload", purpose="List orders", status=InvestigationStatus.waiting_approval, token_usage=80))
        db.add(BugInvestigation(title="Checkout crashes", repository="demo/shop", error_message="secret log", status=InvestigationStatus.failed))
        db.add(CodeReview(repository="demo/shop", pull_request_number=12, status=InvestigationStatus.waiting_approval))
        db.commit()

    response = client.get("/api/v1/history")

    assert response.status_code == 200
    body = response.json()
    assert {item["kind"] for item in body} == {"task", "api", "bug", "review"}
    assert all("report" not in item for item in body)
    assert all("document" not in item for item in body)
    assert all("error_message" not in item for item in body)
    assert all("requester_ip" not in item for item in body)
    assert next(item for item in body if item["kind"] == "task")["approved"] is True
