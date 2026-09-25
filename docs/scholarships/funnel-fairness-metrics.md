# Application & Award Funnel Fairness Metrics

## Summary
Design for privacy-safe aggregate analysis of eligibility, completion,
review, decision, and award outcomes.

## Design
- Metrics are computed only over cohorts above a minimum size threshold
  (e.g. n >= 20); smaller cohorts are suppressed from output entirely.
- Each published metric links to a versioned definition doc so "review
  completion rate" always means the same computation over time.
- Output is aggregate counts/rates only — no query path returns
  individually identifiable applicant-level fairness data.
- Definitions and caveats (e.g. small-sample noise) ship alongside every
  metric in the same response payload.

## Follow-up
Implement `FairnessMetricsService` with the suppression threshold and the
definitions registry it reads from.
