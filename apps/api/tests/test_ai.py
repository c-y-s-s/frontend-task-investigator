import pytest
from types import SimpleNamespace
from app.ai import OpenAIAnalyzer, build_instructions, validate_required_evidence
from app.replay import REPLAY_REPORT
from app.schemas import InvestigationReport, SearchPlan


def test_supplied_pr_and_workflow_require_matching_report_evidence():
    report = InvestigationReport.model_validate(REPLAY_REPORT)
    context = {
        "related_pull_requests": [{"number": 42}],
        "workflow_runs": [{"name": "CI"}],
    }
    validate_required_evidence(report, context)

    report.repository_evidence = [
        item for item in report.repository_evidence if item.kind == "pull_request"
    ]
    with pytest.raises(RuntimeError, match="workflow evidence"):
        validate_required_evidence(report, context)


def test_search_planning_returns_structured_terms_and_usage():
    expected = SearchPlan(
        search_terms=["payment", "retryable", "idempotency"],
        path_hints=["checkout", "payment"],
        rationale="Focus on payment state and request safety.",
    )

    class FakeResponses:
        def parse(self, **kwargs):
            assert kwargs["text_format"] is SearchPlan
            return SimpleNamespace(output_parsed=expected, usage=SimpleNamespace(total_tokens=321))

    analyzer = object.__new__(OpenAIAnalyzer)
    analyzer.client = SimpleNamespace(responses=FakeResponses())
    analyzer.model = "test-model"

    plan, tokens = analyzer.plan_search({"number": 1, "title": "Retry payment", "body": ""})
    assert plan.search_terms == ["payment", "retryable", "idempotency"]
    assert tokens == 321


def test_zh_tw_prompt_requires_natural_taiwan_engineering_language():
    instructions = build_instructions("zh-TW")

    assert "Taiwanese software team" in instructions
    assert "程式碼" in instructions
    assert "字段" in instructions
    assert "API, Response, Request" in instructions
