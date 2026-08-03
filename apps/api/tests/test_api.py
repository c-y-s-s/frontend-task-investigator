import time


def create_replay(client):
    response = client.post("/api/v1/investigations", json={
        "repository": "demo/frontend-agent-demo-shop", "issue_number": 128,
        "branch": "main", "include_pull_requests": True, "mode": "replay",
    })
    assert response.status_code == 202
    investigation_id = response.json()["id"]
    for _ in range(30):
        result = client.get(f"/api/v1/investigations/{investigation_id}").json()
        if result["status"] == "waiting_approval":
            return result
        time.sleep(0.05)
    raise AssertionError("Replay workflow did not finish")


def test_replay_reaches_approval_with_grounded_report(client):
    result = create_replay(client)
    assert result["status"] == "waiting_approval"
    assert len(result["steps"]) == 8
    assert result["report"]["impacted_files"]
    for file in result["report"]["impacted_files"]:
        assert file["citations"]


def test_approve_is_state_guarded(client):
    result = create_replay(client)
    response = client.post(f"/api/v1/investigations/{result['id']}/approve", json={"actor": "test-reviewer"})
    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    duplicate = client.post(f"/api/v1/investigations/{result['id']}/approve", json={"actor": "test-reviewer"})
    assert duplicate.status_code == 409


def test_reject_requires_reason(client):
    result = create_replay(client)
    invalid = client.post(f"/api/v1/investigations/{result['id']}/reject", json={"reason": "no"})
    assert invalid.status_code == 422
    valid = client.post(f"/api/v1/investigations/{result['id']}/reject", json={"reason": "Missing provider retry semantics"})
    assert valid.status_code == 200
    assert valid.json()["status"] == "rejected"


def test_live_mode_enforces_repository_allowlist(client):
    response = client.post("/api/v1/investigations", json={
        "repository": "someone/untrusted", "issue_number": 1, "branch": "main", "mode": "live",
    })
    assert response.status_code == 403


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"

