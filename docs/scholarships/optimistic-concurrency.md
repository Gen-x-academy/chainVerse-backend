# Optimistic Concurrency & Conflict Handling

## Summary
Design for preventing stale program, application, review, award, and
finance updates from overwriting newer state.

## Design
- Every mutable scholarship resource carries a `version` (or `updatedAt`)
  field; updates include the version they read and are rejected if it no
  longer matches the current stored version.
- A version conflict returns a `409` with the current server state
  attached, so the client can reload or diff rather than guessing.
- No partial mutation occurs on a conflict — the write is rejected
  entirely, never partially applied.
- This applies uniformly across programs, applications, reviews, awards,
  and finance records sharing one conflict-handling middleware/decorator.

## Follow-up
Implement a shared `OptimisticConcurrencyInterceptor` applied to the
scholarships module's mutation endpoints.
