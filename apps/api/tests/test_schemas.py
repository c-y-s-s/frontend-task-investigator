import pytest
from pydantic import ValidationError
from app.schemas import InvestigationReport


def test_findings_require_citations():
    with pytest.raises(ValidationError):
        InvestigationReport.model_validate({
            "requirement_summary": "Summary", "clarification_questions": [],
            "impacted_files": [{"path": "x.ts", "reason": "Reason", "risk_level": "high", "citations": []}],
            "implementation_tasks": [], "acceptance_criteria": [], "risks": [],
            "confidence": {"level": "low", "reason": "No evidence"},
        })

