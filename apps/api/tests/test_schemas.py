import pytest
from pydantic import ValidationError
from app.ai import build_instructions
from app.schemas import Citation, InvestigationCreate, InvestigationReport


def test_findings_require_citations():
    with pytest.raises(ValidationError):
        InvestigationReport.model_validate({
            "requirement_summary": "Summary", "clarification_questions": [],
            "repository_evidence": [],
            "impacted_files": [{"path": "x.ts", "reason": "Reason", "risk_level": "high", "citations": []}],
            "implementation_tasks": [], "acceptance_criteria": [], "risks": [],
            "confidence": {"level": "low", "reason": "No evidence"},
        })


def test_citation_accepts_http_url_without_unsupported_json_schema_format():
    citation = Citation.model_validate({
        "url": "https://github.com/acme/repo/blob/main/app.tsx#L1",
        "label": "app.tsx:1",
        "kind": "file",
    })
    assert citation.url.startswith("https://")
    assert "format" not in Citation.model_json_schema()["properties"]["url"]


@pytest.mark.parametrize("url", ["javascript:alert(1)", "ftp://example.com/file", "not-a-url"])
def test_citation_rejects_non_http_urls(url):
    with pytest.raises(ValidationError):
        Citation.model_validate({"url": url, "label": "unsafe", "kind": "file"})


def test_investigation_locale_is_allowlisted():
    assert InvestigationCreate(repository="acme/shop", issue_number=1).locale == "zh-TW"
    with pytest.raises(ValidationError):
        InvestigationCreate(repository="acme/shop", issue_number=1, locale="fr")


def test_language_instruction_matches_ui_locale():
    chinese = build_instructions("zh-TW")
    english = build_instructions("en")
    assert "Traditional Chinese" in chinese
    assert "Do not use Simplified Chinese" in chinese
    assert "prose in English" in english
    assert "file paths" in chinese and "file paths" in english
    assert "repository_evidence" in chinese and "repository_evidence" in english
