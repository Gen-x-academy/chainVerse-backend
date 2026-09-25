# Sponsor Impact Reporting

## Summary
Design for reporting recipients, funded learning, completion, credentials,
and aggregate outcomes without overstating causality.

## Design
- Reports present funded-cohort outcomes as descriptive statistics
  ("of N funded students, X% completed") rather than causal claims.
- Every metric links to its definition doc, matching the pattern in #1183
  and #1197 so terminology stays consistent across reports.
- Small cohorts are suppressed using the same threshold rule as #1183.
- Sponsors can only query their own funded cohort; the query layer
  enforces this at the repository level, not just the controller.

## Follow-up
Implement `SponsorImpactReportService` reusing the suppression and
definitions-registry logic from #1183.
