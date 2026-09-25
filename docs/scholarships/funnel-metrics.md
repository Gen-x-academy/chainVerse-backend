# Scholarship Funnel Metrics

## Summary
Design for measuring program views, starts, submissions, review duration,
decisions, acceptance, milestones, and payment completion.

## Design
- Each funnel stage emits a versioned event (`program_viewed`,
  `application_started`, ... `payment_completed`) with a stable
  `applicationId` correlation key across stages.
- Events deduplicate on `eventId` so retried requests don't inflate counts.
- A `dataFreshness` timestamp is exposed alongside every metrics response
  so consumers know how current the numbers are.
- Fields that could identify an individual applicant are excluded from
  the funnel output; it is aggregate-only (see #1183 for the fairness
  angle on the same data).

## Follow-up
Implement `FunnelMetricsService` consuming the outbox events from #1201.
