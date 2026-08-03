import json
from openai import OpenAI
from .config import Settings
from .schemas import InvestigationReport


SYSTEM_PROMPT = """You are a frontend task investigation agent. Produce an implementation-ready report grounded only in supplied GitHub evidence.

Success means:
- identify relevant frontend files and explain why they are affected
- propose bounded implementation tasks and acceptance criteria
- distinguish direct evidence from inference
- attach at least one supplied GitHub citation to every file, task, and risk
- ask concise clarification questions for genuinely missing product or API facts

Never invent paths, line numbers, pull requests, or workflow status. If evidence is incomplete, narrow the claim and mark it as inference. Do not expose hidden reasoning."""


class OpenAIAnalyzer:
    def __init__(self, settings: Settings):
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required for live mode")
        self.client = OpenAI(api_key=settings.openai_api_key, timeout=45, max_retries=2)
        self.model = settings.openai_model

    def analyze(self, context: dict) -> tuple[InvestigationReport, int]:
        response = self.client.responses.parse(
            model=self.model,
            reasoning={"effort": "low"},
            store=False,
            max_output_tokens=5000,
            instructions=SYSTEM_PROMPT,
            input=json.dumps(context, ensure_ascii=False),
            text_format=InvestigationReport,
        )
        if response.output_parsed is None:
            raise RuntimeError("The model did not return a structured investigation report")
        usage = getattr(response, "usage", None)
        total_tokens = getattr(usage, "total_tokens", 0) if usage else 0
        return response.output_parsed, total_tokens

