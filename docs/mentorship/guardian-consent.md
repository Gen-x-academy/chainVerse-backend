# Mentorship guardian consent

Work item **MENTOR-047** — *Support guardian consent when required* (#1335).
Cross-repository counterpart work (web/mobile guardian invitation screens and
verification-provider integration) consumes the endpoints below; no frontend or
contract changes are made here.

## Purpose

Minors must not be able to bypass a guardian's consent before taking part in a
mentorship. This module evaluates an age policy, invites a verified guardian,
records their scoped decision, and blocks activity when consent is missing,
expired, revoked or bound to outdated terms. All decisions are append-only:
revocation and re-consent add new records rather than mutating history.

## Module and dependencies

- Code: `src/mentorship/guardian-consent/` (registered in `src/app.module.ts`).
- `MongooseModule` — one collection, `mentorship_guardian_consents`.
- `MetricsModule` — domain counters via `MentorshipTelemetry`.
- `JwtAuthGuard` — supplies `sub`, `email` and `role` on every request.
- Relationship verification is external: this service stores only an opaque
  `verifiedRelationshipRef`; it does not perform identity verification itself.

## State model

```
evaluate ─▶ invite (INVITED) ─▶ accept (GRANTED)
                                   │
                                   ├─ revoke ──────▶ REVOKED
                                   └─ material change ▶ new INVITED (re-consent) ▶ GRANTED
```

A record carries the scope list, `materialChangeVersionHash` (hash of
engagement, program, scopes and terms version), `agePolicyVersion`, `expiresAt`
and the hash of the record it supersedes. The effective record is always the
one with the highest `sequence` for a `(minorId, engagementId)` pair.

## Privacy boundary

| Data | Minor / participants | Admin / moderator |
|------|----------------------|-------------------|
| Status, scopes, versions, expiry, timestamps | Yes | Yes |
| Verification reference, relationship, deciding actor | No | Yes (audit snapshots only) |
| Guardian contact hash, invite token hash, reason hash, one-time invite token | No | No |

Raw guardian contact and free-text reasons are never stored: only SHA-256
hashes are persisted. The one-time invite token is returned once by
`invite`/`re-consent` and is derived from the caller's high-entropy idempotency
key so that an exact retry returns the same token without a second record.
Snapshots returned to participants never include private fields; coordinator
snapshots add only the verification reference and decision actor.

## Endpoints

All routes require `Authorization: Bearer <token>` and are served under the
global `/api/v1` prefix.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/mentorship/guardian-consent/evaluate` | Age-policy decision for the caller (or a coordinator-supervised minor) |
| POST | `/mentorship/guardian-consent/invites` | Create an invite bound to scopes and a terms version |
| POST | `/mentorship/guardian-consent/accept` | Guardian accepts with the one-time token and matching verification reference |
| POST | `/mentorship/guardian-consent/revoke` | Guardian/coordinator revokes; future activity is blocked |
| POST | `/mentorship/guardian-consent/re-consent` | Fresh invite after a material change |
| GET | `/mentorship/guardian-consent/engagements/:engagementId/snapshot` | Current privacy-safe snapshot (`?minorId=` for coordinators) |
| GET | `/mentorship/guardian-consent/engagements/:engagementId/history` | Append-only decision history |

Services also expose `assertActive(minorId, engagementId, scopes, expectedHash)`
as the integration hook other mentorship flows should call before any activity
that requires guardian consent.

## Idempotency, errors and telemetry

Unique indexes cover `(minorId, engagementId, sequence)`, `inviteTokenHash` and
`idempotencyKeyHash`. Conditional appends and duplicate-key recovery make
retries safe: no second record, no new token, no duplicated effect.

Stable codes: `GUARDIAN_CONSENT_NOT_REQUIRED`,
`GUARDIAN_CONSENT_INVALID_EXPIRY`, `GUARDIAN_INVITE_NOT_FOUND`,
`GUARDIAN_INVITE_NOT_ACTIVE`, `GUARDIAN_INVITE_EXPIRED`,
`GUARDIAN_CONSENT_SUPERSEDED`, `GUARDIAN_RELATIONSHIP_UNVERIFIED`,
`GUARDIAN_SELF_ACTION_DENIED`, `GUARDIAN_CONSENT_REQUIRED`,
`GUARDIAN_CONSENT_PENDING`, `GUARDIAN_CONSENT_REVOKED`,
`GUARDIAN_CONSENT_EXPIRED`, `GUARDIAN_CONSENT_STALE`,
`GUARDIAN_CONSENT_SCOPE_MISSING`. Authorization denials use
`MENTOR_ACCESS_DENIED`.

Counters: `mentorship_guardian_consent_events_total{event,outcome}` and
`mentorship_guardian_consent_denied_total{reason}`. No user ids or free text
are used as label values.

## Rollout and rollback

1. Deploy. Create the unique indexes ahead of time when `autoIndex` is off.
2. Seed the jurisdiction threshold configuration in `age-policy.service.ts`
   for the regions the program operates in.
3. Watch denial and event counters; a high `relationship_unverified` rate
   points to a verification-provider integration issue.
4. Rollback: remove `GuardianConsentModule` from `AppModule`. The collection is
   self-contained and no other module writes to it. Existing grants remain in
   the database but are no longer enforced, so gate rollout on the consuming
   flows calling `assertActive`.
