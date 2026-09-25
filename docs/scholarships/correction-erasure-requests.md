# Correction & Erasure Requests

## Summary
Design for processing valid applicant corrections or deletions while
preserving lawful immutable financial and audit records.

## Design
- Requests are tracked as `{status: received|in_review|applied|denied}`
  records with a reason required for `denied`.
- Erasure anonymizes personal fields on the applicant record but never
  deletes financial/audit rows required for regulatory retention (see
  #1192); those rows retain only a pseudonymous reference.
- Downstream copies (search index, analytics snapshots, sponsor exports
  already delivered) are enumerated and each gets its own tracked
  remediation task rather than being silently assumed handled.
- Denial reasons are stored and can be surfaced back to the requester.

## Follow-up
Implement `DataSubjectRequestService` with the downstream-copy checklist
as a required field before a request can be closed.
