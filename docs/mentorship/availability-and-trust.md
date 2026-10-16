# Mentor availability and trust indicators

Backend work for **MENTOR-013** (availability status) and **MENTOR-014**
(profile completion and trust indicators). Code lives in `src/mentorship/`
(`MentorshipModule`).

## Availability (MENTOR-013)

States: `accepting`, `limited` (requires `maxActiveMentees`), `waitlist_only`,
`temporarily_unavailable`, `inactive`. A mentor with no history is `inactive`.

Changes are an **append-only log** (`mentor_availability_changes`). The status
in force is the entry with the latest `effectiveFrom <= now`, ties broken by a
per-mentor `sequence`. Because the status is *resolved at read time*:

- a future change activates on its date with no background job;
- history is a complete audit trail;
- changing availability never touches scheduled engagements — this module has
  no write path to them.

| Method | Route | Who |
|---|---|---|
| `PUT` | `/mentorship/availability/me` | tutor (own record only; the mentor id comes from the JWT, never the body) |
| `GET` | `/mentorship/availability/me` | tutor — current status plus scheduled changes |
| `GET` | `/mentorship/availability/:mentorId` | public — status, `discoverable`, `applications` (`open`/`waitlist`/`closed`) only |
| `GET` | `/mentorship/availability/:mentorId/history` | admin / moderator |

Rules: `effectiveFrom` may be at most 5 minutes in the past and one year ahead;
`maxActiveMentees` (1–100) is required for `limited` and rejected otherwise.
Every request carries an `idempotencyKey`: a retry returns the original change;
reusing a key with different content is a `409 BIZ_MENTOR_AVAILABILITY_CONFLICT`.
A `mentorship.availability.changed` event and a log line are emitted per change.

Applications should call `MentorAvailabilityService.assertAcceptsApplications()`
(throws `BIZ_MENTOR_NOT_ACCEPTING`) and discovery should filter on
`discoverable`.

## Trust indicators (MENTOR-014)

`GET /mentorship/trust/:mentorId` (public) returns five indicators —
`completion`, `verification`, `response`, `delivery`, `safety` — each with a
level (`insufficient_data`, `low`, `medium`, `high`) and a plain-language
meaning. Raw inputs are never returned.

- **Deterministic**: pure function in `trust/trust-indicators.ts`.
- **Not self-awardable**: counters are stored in `mentor_trust_signals` and only
  written by `MentorTrustService.recordSignals()`, an internal API with no REST
  endpoint.
- **Sparse data**: rate indicators need at least 5 observations, otherwise
  `insufficient_data`.
- **No protected attributes** are inputs; only counts of platform activity.

## Known gaps / dependencies

- Nothing calls `recordSignals` yet: wiring it to credential verification
  (MENTOR-012), session delivery and moderation is follow-up work, so every
  mentor currently shows `insufficient_data`/baseline levels.
- The application and discovery flows do not exist on `main`; they should adopt
  the two integration points above when they land.
- Integration tests against a real MongoDB are not included; unit specs cover
  the rules and the service with an in-memory model double.
- Rollout is additive: new collections, new routes, no migration.
