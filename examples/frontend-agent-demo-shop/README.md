# Frontend Agent Demo Shop

Controlled evaluation fixture for Task Investigator. Publish this directory as a separate GitHub repository named `frontend-agent-demo-shop`, then create Issue #128 from `fixtures/issue-128.md`.

Ground truth for Issue #128:

- Relevant: `paymentApi.ts`, `usePayment.ts`, `PaymentForm.tsx`, `PaymentForm.test.tsx`
- Highest risk: duplicate payment intent without a stable idempotency key
- Required paths: transient success, permanent decline, retry exhaustion, concurrent click protection

