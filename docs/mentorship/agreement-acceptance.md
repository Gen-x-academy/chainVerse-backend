# Mentorship Agreement Acceptance (MENTOR-046)

## Purpose

Records an explicit, replay-resistant acceptance of a mentorship agreement by
each intended participant. Evidence captures the actor, the exact terms hash,
the individual term versions, a one-time nonce and a timestamp. A new terms
version invalidates prior acceptance: acceptance is always bound to the current
version and its hash.

Cross-repository work item: `MENTOR-046` (backend acceptance workflow; paired
with the client work that renders terms and generates the nonce/hash
commitment).

## Dependencies

- `JwtAuthGuard` (`src/common/guards/jwt-auth.guard.ts`) and the `access-token`
  Swagger bearer scheme.
- `MongooseModule` models `AgreementTerms` and `AgreementAcceptance`.
- `MetricsModule` + shared `MentorshipTelemetry` for guarded counters and
  structured logs.
- Existing `ErrorCode` values: `MENTOR_ACCESS_DENIED`, `MENTOR_STALE_VERSION`,
  `RES_NOT_FOUND`, `VAL_INVALID_INPUT`, `BIZ_DUPLICATE_REQUEST`.
- No other mentorship module is modified; this is an additive feature.

## Privacy boundary

- The private agreement body (`terms`) lives only in the `AgreementTerms`
  snapshot collection. Acceptance documents and every read projection store
  and return **only** the hash and term-version map — never the body.
- Publishing new terms is restricted to admins/moderators (coordinators).
- Accepting is restricted to the actors listed on the current terms snapshot;
  privileged roles cannot accept on a participant's behalf.
- A single acceptance proof is readable only by its subject or a coordinator;
  the history listing is restricted to participants or coordinators.

## Consistency and idempotency

- Append-only: terms snapshots and acceptance evidence are never updated or
  deleted by a normal flow. Corrections require a new terms version.
- Unique index on `{ agreementId, version, actorId }` makes repeated
  acceptance idempotent; a duplicate-key race returns the stored winner.
- Unique index on `nonce` makes the signed intent replay-resistant.
- The service compares the submitted version **and** hash to the latest terms
  snapshot (highest version) so changed terms invalidate stale acceptance.
- Telemetry counters are emitted on success, replay, denial, stale terms and
  validation failure; each emission is wrapped so telemetry cannot break the
  business path.

## Endpoints

All routes are under `mentorship/agreements` and require a bearer token.

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| POST | `/terms` | Publish a new immutable terms version | Admin / moderator |
| GET | `/:agreementId/terms/current` | Current version, hash and effective date (no private body) | Authenticated |
| POST | `/:agreementId/accept` | Record acceptance of the current terms | Listed participant |
| GET | `/:agreementId/acceptance` | List client-safe acceptance proofs | Participant / coordinator |
| GET | `/:agreementId/acceptance/:subjectId?version=N` | One proof | Subject / coordinator |

## Rollout and rollback

- Rollout: additive module registered in `src/app.module.ts`; no migrations for
  existing collections. Mongoose creates the two new collections and indexes
  on first use. Ensure the compound unique indexes build successfully before
  enabling the accept endpoint in production.
- Rollback: remove `AgreementAcceptanceModule` from `app.module.ts` and
  unregister its routes. Do **not** drop the acceptance collection during a
  rollback — it is legal evidence of consent. Existing documents remain
  readable after a re-deploy of the previous version.
- Feature-flag the client publish action so terms cannot be published before
  the indexes are in place (otherwise duplicate races could insert twice).
