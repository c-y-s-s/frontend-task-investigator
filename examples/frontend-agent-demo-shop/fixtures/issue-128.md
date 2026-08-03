# Add retry flow for failed payment attempts

Customers must currently refresh checkout after a transient payment failure. Add automatic retry up to three attempts and show retry progress in the payment form.

## Acceptance criteria

- Retry a temporary provider or network failure up to three attempts.
- Show the current attempt while retrying.
- Display a clear final error after retries are exhausted.
- Do not create duplicate charges.

