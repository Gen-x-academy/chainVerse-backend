# Payout Anomaly Detection

## Summary
Design for identifying unusual destinations, rapid wallet changes,
repeated failures, duplicate ledger references, and suspicious splits.

## Design
- Each payout is scored against simple, explainable rules first (new
  destination wallet, wallet changed <24h before payout, duplicate
  on-chain reference across payouts) before any ML-based scoring.
- A high-risk payout transitions to a `paused` state automatically; funds
  are not released until an authorized finance reviewer clears it.
- Alerts include the specific rule(s) triggered and the supporting record
  IDs, not just a risk number.
- Resolution (approve/deny) is written to the immutable audit trail
  (see #1195) with the reviewer's identity and rationale.

## Follow-up
Implement `PayoutAnomalyGuard` in the payout service's pre-disbursement
step.
