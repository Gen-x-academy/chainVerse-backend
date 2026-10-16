# Load Test Plan: Scholarship Deadlines & Award Batches

## Summary
Plan to measure burst submissions, searches, uploads, reviews,
notifications, decisions, and payouts near deadlines.

## Design
- Target throughput/latency numbers and the synthetic dataset size are
  documented up front (e.g. "5k concurrent submissions in the final hour
  before a deadline") before any load run.
- Load-test tenants/data are isolated from real tenant data; no scenario
  is allowed to touch production or another tenant's data.
- Under saturation, the system is expected to shed load gracefully
  (queue/backpressure, clear 429s) rather than silently dropping or
  duplicating award/payout records.
- Results are captured per scenario (submissions, uploads, payouts) since
  they stress different subsystems.

## Follow-up
Implement the load scenarios with the project's existing load-testing
tool against a dedicated staging tenant.
