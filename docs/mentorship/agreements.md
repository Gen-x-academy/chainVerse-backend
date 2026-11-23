# Mentorship engagement agreements

Work item **MENTOR-045** — *Create mentorship engagement agreements* (#1332).
The cross-repository counterpart work (web/mobile agreement review and signing
screens) consumes the endpoints below; no frontend or contract changes are made
here.

## Purpose

An agreement captures the full set of engagement terms — participants,
program, goals, scope, duration, cadence, price, currency, cancellation and
conduct policies, plus evidence references. It stays a draft until every
configured approval has accepted the exact current term version and hash. Once
active, its terms are immutable: changes require a new versioned agreement.

## Module and dependencies

- Code: `src/mentorship/agreements/` (registered in `src/app.module.ts`).
- `MongooseModule` — collection `mentorship_agreements`.
- `MetricsModule` — domain counters via `MentorshipTelemetry`.
- `JwtAuthGuard` — supplies the acting user's `sub` and `role`.
- Related existing schemas read for alignment:
  `src/mentorship/schemas/mentorship-engagement.schema.ts` and
  `match-terms.schema.ts`. This module is additive and does not modify them.

## Lifecycle

```
create (DRAFT, termsVersion 1, termsHash) ─▶ approvals (append-only)
        ─▶ all required approvals present ─▶ ACTIVE (immutable)
        ─▶ end ─▶ ENDED
```

`requiredApprovals` defaults to `mentor` and `mentee` and may include
`coordinator`. An approval stores its role, actor, accepted timestamp and the
version/hash it accepted. Activation checks that every required role approved
the **current** version and hash, then performs a single conditional update
(`status: draft`, expected `version`) so concurrent activations cannot both
succeed.

`termsHash` is SHA-256 over canonicalised terms (stable key order, sorted
goal/evidence arrays); any material edit produces a different hash. There is no
terms-edit endpoint — an active agreement cannot be changed.

## Privacy boundary

| Data | Participants | Coordinators |
|------|--------------|--------------|
| Terms, version/hash, status, approval roles and timestamps | Yes | Yes |
| Approval user ids | No | Yes (full record) |
| Coordinator `privateNote` | No | Yes (full record) |

`GET /:id/snapshot` is the participant-readable view. It never includes the
private note or approval user ids. Only coordinators may call the full-record
and program-list endpoints.

## Endpoints

All routes require `Authorization: Bearer <token>` and are served under the
global `/api/v1` prefix.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/mentorship/agreements` | Create a draft with validated terms |
| POST | `/mentorship/agreements/:id/approvals` | Append a version-bound approval (explicit `acceptTerms: true`) |
| POST | `/mentorship/agreements/:id/activate` | Activate once all approvals are present |
| POST | `/mentorship/agreements/:id/end` | End an active agreement with a reason |
| GET | `/mentorship/agreements/:id/snapshot` | Privacy-safe participant snapshot |
| GET | `/mentorship/agreements/:id` | Full record (coordinators only) |
| GET | `/mentorship/agreements/program/:programId` | List a program's agreements (coordinators only) |

## Idempotency, errors and telemetry

A unique `clientKey` (derived from the caller's idempotency key and the
participant triple) makes creation idempotent. Approvals are idempotent per
actor/role/term version, and activation/ending use optimistic `version`
checks. Retries return the existing state without duplicate approvals.

Stable codes: `AGREEMENT_TERMS_INCOMPLETE`, `AGREEMENT_CREATE_DENIED`,
`AGREEMENT_SELF_MATCH_DENIED`, `AGREEMENT_NOT_FOUND`,
`AGREEMENT_ROLE_NOT_REQUIRED`, `AGREEMENT_APPROVAL_DENIED`,
`AGREEMENT_TERMS_STALE`, `AGREEMENT_APPROVALS_INCOMPLETE`,
`AGREEMENT_IMMUTABLE`, `AGREEMENT_VERSION_CONFLICT`, `AGREEMENT_NOT_ACTIVE`,
`AGREEMENT_ENDED`, `AGREEMENT_INSPECT_DENIED`. Authorization denials use
`MENTOR_ACCESS_DENIED`.

Counters: `mentorship_agreement_events_total{event,outcome}` and
`mentorship_agreement_denied_total{reason}`. No user ids or free text are used
as label values.

## Rollout and rollback

1. Deploy and pre-create the unique `clientKey` index when `autoIndex` is off.
2. Keep agreements read-only in the UI until both approvals land; the API
   already refuses early activation.
3. Watch `approvals_incomplete` and `version_conflict` counters; sustained
   conflicts indicate concurrent activation retries worth investigating.
4. Rollback: remove `AgreementModule` from `AppModule`. The collection is
   self-contained, so no other module is affected and no migration is needed.
