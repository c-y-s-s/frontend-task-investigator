import time

import pytest

from app.api_analyzer import OpenApiDocumentError, parse_openapi_document, summarize_openapi, summarize_response_json


SPEC = """
openapi: 3.0.3
info:
  title: Demo Orders API
  version: 1.0.0
paths:
  /orders:
    get:
      summary: List orders
      responses:
        '200':
          description: Orders
    post:
      operationId: createOrder
      summary: Create an order
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                productId: {type: string}
      responses:
        '201': {description: Created}
        '400': {description: Invalid request}
"""


def test_summarize_openapi_finds_frontend_contract_gaps():
    result = summarize_openapi(parse_openapi_document(SPEC))

    assert result["api_title"] == "Demo Orders API"
    assert [(item["method"], item["path"]) for item in result["endpoints"]] == [("GET", "/orders"), ("POST", "/orders")]
    titles = {item["title"] for item in result["deterministic_findings"]}
    assert "Pagination is not documented" in titles
    assert "No error response documented" in titles
    assert "Missing operationId" in titles


def test_external_refs_are_rejected():
    with pytest.raises(OpenApiDocumentError, match="External"):
        parse_openapi_document(SPEC + "\ncomponents:\n  schemas:\n    Order:\n      $ref: https://example.com/order.yaml\n")


def test_replay_api_analysis_reaches_human_approval(client):
    response = client.post("/api/v1/api-analyses", json={"document": SPEC, "input_type": "openapi", "mode": "replay", "locale": "zh-TW"})
    assert response.status_code == 202
    analysis_id = response.json()["id"]
    for _ in range(30):
        result = client.get(f"/api/v1/api-analyses/{analysis_id}").json()
        if result["status"] == "waiting_approval":
            break
        time.sleep(0.05)
    else:
        raise AssertionError("API analysis did not finish")

    assert result["report"]["api_title"] == "Demo Orders API"
    assert result["report"]["endpoints"]
    approved = client.post(f"/api/v1/api-analyses/{analysis_id}/approve", json={"actor": "test-reviewer"})
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"


def test_response_sample_infers_nullability_pagination_and_redacts_pii():
    result = summarize_response_json(
        '{"data":[{"email":"person@example.com","company":null},{"email":"other@example.com","company":"Acme"}],"meta":{"current_page":1,"total":2}}',
        "Admin list", "GET", "/applications",
    )

    fields = {item["path"]: item for item in result["response_fields"]}
    assert result["analysis_type"] == "response"
    assert result["pagination_detected"] is True
    assert fields["$.data[].company"]["nullable"] is True
    assert "$.data[].email" in result["privacy_fields"]
    assert result["sanitized_sample"]["data"][0]["email"] == "[REDACTED]"
    assert "interface ResponseItem" in result["typescript_draft"]
    assert "company: null | string" in result["typescript_draft"]
    assert "meta: PaginationMeta" in result["typescript_draft"]


def test_response_sample_is_the_default_api_analysis_mode(client):
    response = client.post("/api/v1/api-analyses", json={
        "document": '{"data":[{"id":1,"name":"Test"}],"meta":{"current_page":1,"total":1}}',
        "purpose": "Admin application list", "method": "GET", "path": "/applications",
        "mode": "replay", "locale": "zh-TW",
    })
    assert response.status_code == 202
    analysis_id = response.json()["id"]
    for _ in range(30):
        result = client.get(f"/api/v1/api-analyses/{analysis_id}").json()
        if result["status"] == "waiting_approval":
            break
        time.sleep(0.05)
    assert result["input_type"] == "response"
    assert result["report"]["analysis_type"] == "response"
    assert result["report"]["privacy_warnings"]
