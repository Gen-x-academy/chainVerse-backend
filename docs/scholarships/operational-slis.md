# Scholarship Operational SLIs

## Summary
Design for measuring latency, errors, queue age, notification lag,
payment finalization, and reconciliation drift.

## Design
- Each SLI (API latency, error rate, outbox queue age, notification
  delivery lag, payout finalization time, reconciliation drift) has a
  documented target and an alert threshold.
- Metrics are emitted via the existing `src/metrics`/`src/observability`
  infrastructure rather than a new parallel system.
- Every emitted metric/log line carries the existing correlation ID so an
  operator can trace one request's failure across services.
- No secret or PII value is ever included in a metric label.

## Follow-up
Register the six SLIs above as named metrics in `src/metrics` and add
dashboard/alert definitions referencing them.
