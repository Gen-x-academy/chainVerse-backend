# Verified Student Identity & Enrollment Integration

## Summary
Design for verifying applicant identity and active enrollment through
approved providers with minimum data retention.

## Design
- Provider claims are stored as `{issuer, claimType, expiresAt}` records,
  never the raw underlying document/credential.
- Claims are issuer-scoped: a claim from provider A cannot satisfy a check
  requiring provider B without an explicit equivalence mapping.
- Expired claims fail the check and trigger a re-verification prompt
  rather than silently passing on stale data.
- If no approved provider is reachable, the application routes to manual
  fallback review instead of blocking the applicant outright.
- Provider API secrets are never logged or stored outside the existing
  secrets manager.

## Follow-up
Implement `IdentityVerificationService` with a provider adapter interface
so additional providers can be added without touching call sites.
