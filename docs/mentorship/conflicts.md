# Conflict-of-interest detection (MENTOR-040)

Backend work for the cross-repository **MENTOR-040** work item. Code lives in
`src/mentorship/conflicts/` and is registered as `ConflictModule` in
`src/app.module.ts`.

## Purpose

Check organization, reporting, review, financial and declared relationship
conflicts before proposal and activation:

- The pure evaluator in `domain/conflict.evaluator.ts` returns a deterministic
  outcome (`clear`, `potential`, `hard`) and public-safe findings. Shared
  organization is *potential*; reporting, review and financial relationships
  are *hard* blockers; declared relationships use the declarant's severity.
- Checks are immutable and **versioned**: a retry of identical input returns
  the same row (`inputHash` unique key), while changed input creates the next
  `checkVersion`. The rules version is recorded on every row.
- Explanations are available to authorized actors (staff and the two
  participants) as codes plus generic messages; private free text is kept in
  `privateNotes` and is staff-only.
- **Hard conflicts block activation**. `assertActivatable()` is the integration
  point for proposal activation and returns structured `blockingCodes` on
  `MENTOR_CONFLICT_OF_INTEREST`.
- **Waivers require separate approval**. A waiver request is one append-only
  version; approval/rejection is a new version written by a different staff
  member (`BIZ_SEPARATION_OF_DUTIES` otherwise). `BIZ_OVERRIDE_ALREADY_RESOLVED`
  and `MENTOR_STALE_VERSION` guard duplicate or stale decisions.

## Dependencies

- `src/mentorship/review-queue/schemas/conflict-declaration.schema.ts` holds
  the existing reviewer COI declaration; this feature complements it with
  participant-level checks rather than replacing it.
- `MentorshipTelemetry` (via `MetricsModule`) for `mentorship_conflict_*`
  counters; `ConflictAccessPolicy` for deny-by-default authorization.
- Mentorship proposal activation should call `ConflictService.assertActivatable()`
  before transitioning to `accepted`.

## Privacy boundary

- Findings contain only codes, categories, severities and generic messages.
  Declared relationship notes, waiver reasons and decision notes are private
  to staff and never included in participant-facing views.
- Participants may check and explain only their own proposal; all other
  callers are denied with `MENTOR_ACCESS_DENIED` and a telemetry counter.
- Staff inspection is explicit and recorded; it does not bypass hard-block
  logic — a waiver is still required for activation.

## Rollout and rollback

- Additive: two new collections and new routes. No existing schema is changed.
- Rollback: remove `ConflictModule` from `AppModule`; collections can remain
  unreferenced. Any caller of `assertActivatable()` should be removed or made
  optional at the same time.
- Monitor `mentorship_conflict_check_total`, `mentorship_conflict_waiver_*`
  and authz denials. A spike in hard outcomes or self-approval denials is a
  signal to review the waiver policy.
- `CONFLICT_RULES_VERSION` must be bumped when evaluation rules change so old
  checks stay explainable under the rules that produced them.

## Endpoint list

| Method | Route | Who |
|---|---|---|
| `POST` | `/mentorship/conflicts/checks` | participant (own proposal) or staff — record a versioned check |
| `GET` | `/mentorship/conflicts/checks/:id/explanation` | participant (own) or staff — public explanation; private notes staff-only |
| `GET` | `/mentorship/conflicts/proposals/:proposalId/activation-readiness` | participant or staff — hard-conflict gate |
| `POST` | `/mentorship/conflicts/waivers/request` | participant or staff — request a waiver for a hard finding |
| `POST` | `/mentorship/conflicts/waivers/:proposalId/:findingCode/decide` | staff, not the requester — append approval/rejection |

## Testing

Pure evaluator, DTO validation, service (idempotency, privacy, activation and
waiver separation of duties) and controller delegation specs are included.
Tests were not run locally per the task instructions.
