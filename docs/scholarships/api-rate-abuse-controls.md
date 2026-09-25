# Scholarship API Rate & Abuse Controls

## Summary
Design for protecting discovery, applications, uploads, invitations,
messaging, and payout actions with risk-based limits.

## Design
- Rate limits key off a stable identity (authenticated user ID, or a
  signed device fingerprint for anonymous discovery traffic), not raw IP
  alone, to avoid punishing shared-NAT users unfairly.
- Responses that hit a limit return `429` with a `Retry-After` header and
  never partially apply a mutation (an application draft is never left
  half-saved because of a limit hit mid-request).
- High-risk actions (payout submission) support an explicit service-level
  bypass for trusted internal batch jobs, requiring a separate service
  credential rather than reusing a user token.
- Limits are configurable per action type via the admin config from #1206.

## Follow-up
Implement `ScholarshipRateLimitGuard` reusing the existing rate-limit
infrastructure already present elsewhere in the backend.
