# Scholarship Integration Test Plan

## Summary
Test plan verifying persistence, queues, events, files, notifications,
providers, Stellar adapters, and authorization working together.

## Design
- Each test uses an isolated fixture (fresh test DB schema/collection
  namespace) so tests never share mutable external state.
- Award/payout tests assert idempotency by replaying the same request
  twice and asserting only one side effect occurred.
- Failure-path tests assert a partial failure rolls back cleanly (no
  orphaned award/payment records).
- Stellar/Soroban calls are exercised against the existing sandbox/mock
  adapter already used by `src/stellar`, not live network calls.

## Follow-up
Add the suite under `src/scholarships/__tests__/integration/` using the
existing test-database bootstrap helpers.
