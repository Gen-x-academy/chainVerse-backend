# Scholarship Feature Flags & Staged Rollout

## Summary
Design for gating scholarship discovery, applications, reviews, awards,
and payouts independently per environment/cohort.

## Design
- A `ScholarshipFeatureFlag` document keyed by `{flagKey, tenantId, cohortId}`
  with `enabled`, `rolloutPercent`, and `updatedBy` fields.
- Flag checks happen server-side only (in guards/services), never trusted
  from client input; unknown/missing flags default to **disabled**.
- Rollback sets `enabled=false` without deleting in-flight application or
  award records, so active workflows are not corrupted.
- Every flag change is written to the existing audit-log service with the
  actor, old value, and new value.

## Follow-up
Implement `ScholarshipFeatureFlagService.isEnabled(flagKey, context)` and
wire it into the discovery/application/review/award/payout guards.
