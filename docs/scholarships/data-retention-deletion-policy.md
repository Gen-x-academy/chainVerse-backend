# Scholarship Data Retention & Deletion Policy

## Summary
Design for setting retention by draft, rejected, withdrawn, awarded,
financial, audit, and legal-hold record states.

## Design
- A retention table maps each record state to a retention period (e.g.
  drafts: 90 days after abandonment; financial/audit records: statutory
  minimum per jurisdiction; legal-hold: indefinite until hold is lifted).
- Automated retention runs are dry-runnable and logged before any real
  deletion executes, and are covered by tests asserting the correct rows
  are (and are not) selected for deletion.
- A legal hold flag on a record overrides any computed retention deadline
  and blocks deletion entirely until explicitly cleared by an authorized
  role.
- Deletion never removes rows still required for financial/audit
  integrity (see #1195) — those are anonymized in place instead, matching
  the approach in #1194.

## Follow-up
Implement `RetentionPolicyJob` with the retention table above and the
dry-run reporting mode.
