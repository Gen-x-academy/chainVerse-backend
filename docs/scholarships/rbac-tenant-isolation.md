# Scholarship RBAC & Tenant Isolation

## Summary
Design for enforcing student/sponsor/reviewer/verifier/finance/auditor/
administrator permissions on every scholarship resource.

## Design
- A single `ScholarshipRbacGuard` resolves `{role, tenantId}` from the
  authenticated principal and checks it against a per-endpoint permission
  table, rather than ad hoc checks scattered per controller.
- Every list/query endpoint injects a tenant/ownership filter at the
  repository layer, so a missing controller-level check cannot leak
  cross-tenant rows.
- Direct object access (`GET /applications/:id`) re-checks ownership even
  when the ID is guessable, returning 404 (not 403) to avoid confirming
  existence to unauthorized callers.
- Tests explicitly cover cross-tenant and cross-role access attempts for
  every resource type.

## Follow-up
Implement `ScholarshipRbacGuard` and the tenant-scoped repository base
class, then apply both across the scholarships controllers.
