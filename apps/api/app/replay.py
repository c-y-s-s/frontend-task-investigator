REPLAY_REPOSITORY = "demo/frontend-agent-demo-shop"

REPLAY_CONTEXT = {
    "issue": {
        "number": 128,
        "title": "Add retry flow for failed payment attempts",
        "body": "Customers must refresh checkout after a transient payment failure. Add up to three retries and show retry progress.",
        "url": "https://github.com/demo/frontend-agent-demo-shop/issues/128",
    },
    "files": [
        "src/components/checkout/PaymentForm.tsx",
        "src/hooks/usePayment.ts",
        "src/lib/paymentApi.ts",
        "src/components/checkout/PaymentForm.test.tsx",
    ],
}

REPLAY_REPORT = {
    "requirement_summary": "Add a safe, visible retry flow for transient payment failures without creating duplicate payment intents.",
    "clarification_questions": [
        "Which provider error codes are transient and safe to retry?",
        "Should the retry delay be fixed or exponential?",
    ],
    "impacted_files": [
        {
            "path": "src/lib/paymentApi.ts",
            "reason": "The API client currently treats every non-2xx response as final and has no idempotency contract.",
            "risk_level": "high",
            "citations": [{"url": "https://github.com/demo/frontend-agent-demo-shop/blob/main/src/lib/paymentApi.ts#L18-L41", "label": "paymentApi.ts:18–41", "kind": "file"}],
        },
        {
            "path": "src/hooks/usePayment.ts",
            "reason": "The hook owns request and error state, so it must expose attempt count and prevent concurrent retries.",
            "risk_level": "high",
            "citations": [{"url": "https://github.com/demo/frontend-agent-demo-shop/blob/main/src/hooks/usePayment.ts#L12-L58", "label": "usePayment.ts:12–58", "kind": "file"}],
        },
        {
            "path": "src/components/checkout/PaymentForm.tsx",
            "reason": "The checkout UI needs retry progress, disabled states, and a terminal failure message.",
            "risk_level": "medium",
            "citations": [{"url": "https://github.com/demo/frontend-agent-demo-shop/blob/main/src/components/checkout/PaymentForm.tsx#L30-L86", "label": "PaymentForm.tsx:30–86", "kind": "file"}],
        },
        {
            "path": "src/components/checkout/PaymentForm.test.tsx",
            "reason": "Existing tests cover one failed attempt only; retry success and exhaustion are untested.",
            "risk_level": "medium",
            "citations": [{"url": "https://github.com/demo/frontend-agent-demo-shop/blob/main/src/components/checkout/PaymentForm.test.tsx#L44-L73", "label": "PaymentForm.test.tsx:44–73", "kind": "file"}],
        },
    ],
    "implementation_tasks": [
        {
            "title": "Define retryable payment failures",
            "description": "Map provider failures to retryable and terminal categories and preserve the idempotency key across attempts.",
            "affected_files": ["src/lib/paymentApi.ts"],
            "acceptance_criteria": ["Only transient errors retry", "All attempts reuse one idempotency key"],
            "citations": [{"url": "https://github.com/demo/frontend-agent-demo-shop/blob/main/src/lib/paymentApi.ts#L18-L41", "label": "Current API error handling", "kind": "file"}],
        },
        {
            "title": "Add bounded retry state",
            "description": "Track attempt count, block parallel submissions, and stop after the third failed attempt.",
            "affected_files": ["src/hooks/usePayment.ts"],
            "acceptance_criteria": ["Maximum three attempts", "A second submission cannot start while retrying"],
            "citations": [{"url": "https://github.com/demo/frontend-agent-demo-shop/blob/main/src/hooks/usePayment.ts#L12-L58", "label": "Payment request state", "kind": "file"}],
        },
        {
            "title": "Expose retry progress in checkout",
            "description": "Show the active attempt, retain a clear terminal error, and keep the form accessible while state changes.",
            "affected_files": ["src/components/checkout/PaymentForm.tsx", "src/components/checkout/PaymentForm.test.tsx"],
            "acceptance_criteria": ["Progress is announced to assistive technology", "Success and exhaustion paths are tested"],
            "citations": [{"url": "https://github.com/demo/frontend-agent-demo-shop/blob/main/src/components/checkout/PaymentForm.tsx#L30-L86", "label": "Payment form UI", "kind": "file"}],
        },
    ],
    "acceptance_criteria": [
        "Transient failures retry at most three times.",
        "Permanent failures do not retry.",
        "One payment intent cannot be charged twice.",
        "The UI exposes progress and a clear terminal state.",
    ],
    "risks": [
        {
            "title": "Duplicate charge",
            "severity": "high",
            "explanation": "Retrying without a stable idempotency key can create multiple payment intents.",
            "evidence_type": "direct",
            "citations": [{"url": "https://github.com/demo/frontend-agent-demo-shop/blob/main/src/lib/paymentApi.ts#L18-L41", "label": "No idempotency key in current client", "kind": "file"}],
        },
        {
            "title": "Retrying terminal errors",
            "severity": "medium",
            "explanation": "The current generic error type does not distinguish provider decline from network failure.",
            "evidence_type": "direct",
            "citations": [{"url": "https://github.com/demo/frontend-agent-demo-shop/blob/main/src/lib/paymentApi.ts#L32-L41", "label": "Generic error branch", "kind": "file"}],
        },
        {
            "title": "Backoff policy is unspecified",
            "severity": "medium",
            "explanation": "The Issue requests three retries but does not define delay behavior; confirm before implementation.",
            "evidence_type": "inference",
            "citations": [{"url": "https://github.com/demo/frontend-agent-demo-shop/issues/128", "label": "Issue #128", "kind": "inference"}],
        },
    ],
    "confidence": {"level": "high", "reason": "The payment request, state owner, UI, and existing tests were all located; provider error semantics still require clarification."},
}

