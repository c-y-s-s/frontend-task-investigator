import time

def test_replay_code_review_reaches_approval(client):
    response=client.post("/api/v1/code-reviews",json={"repository":"demo/frontend-agent-demo-shop","pull_request_number":3,"mode":"replay","locale":"zh-TW"})
    assert response.status_code==202
    review_id=response.json()["id"]
    for _ in range(30):
        result=client.get(f"/api/v1/code-reviews/{review_id}").json()
        if result["status"]=="waiting_approval": break
        time.sleep(.05)
    assert result["report"]["verdict"]=="request_changes"
    assert result["report"]["findings"][0]["citations"]
    assert len(result["steps"])==4

def test_live_code_review_requires_allowlisted_repo(client):
    response=client.post("/api/v1/code-reviews",json={"repository":"someone/private","pull_request_number":1,"mode":"live"})
    assert response.status_code==403
