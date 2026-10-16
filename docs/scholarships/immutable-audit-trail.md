# Immutable Scholarship Audit Trail

## Summary
Design for recording security-relevant reads and all program/application/
review/decision/award/milestone/finance mutations.

## Design
- Every mutation and security-relevant read writes an
  `AuditEvent{actor, action, resourceType, resourceId, outcome, requestId,
  occurredAt, safeMetadata}` row.
- `safeMetadata` is an explicit allow-listed field set — never a raw
  dump of the request/response body, to avoid leaking secrets or PII.
- Audit rows are append-only: no product API exposes update or delete on
  this collection; only a separate, tightly-scoped retention job may prune
  rows past the legally required retention window.
- Reads (not just writes) of sensitive resources (e.g. full application
  detail by an admin) are also recorded.

## Follow-up
Implement `AuditEvent` schema and an `@Audited()` decorator/interceptor
applied across the scholarships controllers and services.
