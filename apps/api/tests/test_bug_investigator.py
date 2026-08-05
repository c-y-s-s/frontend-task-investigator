import time

from app.database import SessionLocal
from app.models import BugInvestigation


def create_replay(client):
    response = client.post("/api/v1/bug-investigations", json={
        "title": "Payment fails immediately after provider 503",
        "repository": "demo/frontend-agent-demo-shop",
        "branch": "main",
        "error_message": "PaymentError: provider unavailable",
        "console_log": "Authorization: Bearer secret-value user@example.com",
        "network_context": "POST /api/payments -> 503 {\"code\":\"provider_unavailable\"}",
        "expected_behavior": "Retry temporary failures up to three total attempts",
        "mode": "replay", "locale": "zh-TW",
    })
    assert response.status_code == 202
    item_id = response.json()["id"]
    for _ in range(30):
        result = client.get(f"/api/v1/bug-investigations/{item_id}").json()
        if result["status"] == "waiting_approval": return result
        time.sleep(0.05)
    raise AssertionError("Bug replay did not finish")


def test_bug_replay_returns_ranked_grounded_hypothesis(client):
    result = create_replay(client)
    assert len(result["steps"]) == 6
    assert result["report"]["hypotheses"][0]["rank"] == 1
    assert result["report"]["affected_files"][0]["citations"]
    assert result["report"]["verification_actions"]

    with SessionLocal() as db:
        stored = db.get(BugInvestigation, result["id"])
        assert stored.error_message == ""
        assert stored.console_log == ""
        assert stored.network_context == ""


def test_bug_replay_approval_is_state_guarded(client):
    result = create_replay(client)
    approved = client.post(f"/api/v1/bug-investigations/{result['id']}/approve", json={"actor": "reviewer"})
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    duplicate = client.post(f"/api/v1/bug-investigations/{result['id']}/approve", json={"actor": "reviewer"})
    assert duplicate.status_code == 409


def test_bug_rejection_persists_human_reason(client):
    result = create_replay(client)
    rejected = client.post(f"/api/v1/bug-investigations/{result['id']}/reject", json={"actor": "reviewer", "reason": "Missing a reproducible browser signal"})
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["rejection_reason"] == "Missing a reproducible browser signal"


def test_bug_live_rejects_non_allowlisted_repository(client):
    response = client.post("/api/v1/bug-investigations", json={
        "title": "A sufficiently long bug title", "repository": "someone/private",
        "error_message": "A sufficiently useful error message", "mode": "live",
    })
    assert response.status_code == 403
