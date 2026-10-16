# Idempotent Scholarship Mutations

## Summary
Design for supporting safe retries for submissions, decisions, acceptance,
milestones, payouts, refunds, and notifications.

## Design
- Clients supply an `Idempotency-Key` header; the server binds it to
  `{actorId, operationType}` so two different actors can't collide on the
  same key.
- Concurrent retries with the same key return the **same** stored outcome
  (status + body) rather than reprocessing, using a short-lived lock while
  the first request is in flight.
- Idempotency records have bounded retention (e.g. 24-48h) after which the
  key can be reused, documented explicitly so clients don't rely on
  indefinite dedup.
- Payout/refund operations always check for an existing successful
  idempotency record before touching any external payment/ledger call.

## Follow-up
Implement `IdempotencyKeyGuard`/service reusing the existing
`src/idempotency` module already present in this repo.
