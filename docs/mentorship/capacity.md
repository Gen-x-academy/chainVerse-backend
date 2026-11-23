# Mentor capacity allocation (MENTOR-041)

Backend work for the cross-repository **MENTOR-041** work item. Code lives in
`src/mentorship/capacity/` and is registered as `CapacityModule` in
`src/app.module.ts`.

## Purpose

Enforce per-mentor concurrent-engagement, weekly-time, program and cohort
limits, including reserved proposal capacity:

- **Policies** are immutable and versioned per scope (`global`, `program:<id>`,
  `mentor:<id>`). Publishing identical content is a no-op; a stale
  `expectedVersion` is rejected with `MENTOR_STALE_VERSION`.
- **Allocation counters** live in `mentorship_capacity_allocations` and are
  mutated only by conditional, version-guarded `findOneAndUpdate` calls. Two
  concurrent reservations can never both take the last slot.
- **Reservations** are keyed uniquely by `(mentorId, proposalId)`. A retry
  with the same content returns the original active row; release and expiry
  are conditional state transitions, so neither can double-count.
- **Expiry**: each reservation carries `expiresAt`. The bounded sweeper moves
  due rows to `expired` and restores the allocation; running it repeatedly or
  in parallel is safe.
- **Pauses** are part of a policy version and may carry `pauseExpiresAt`; an
  elapsed pause stops applying without a background job.
- Effective policy resolution is most-specific-wins: mentor → program → global.
  If none exists, `MENTOR_POLICY_MISSING` is returned.

## Dependencies

- `MentorshipCapacityService` (`src/mentorship/mentorship-capacity.service.ts`)
  remains untouched and continues to serve the existing proposal flow. New
  callers may use `CapacityService.assertWithinCapacity()` as a preflight and
  `reserveCapacity()` / `releaseCapacity()` for the lifecycle.
- `MentorshipTelemetry` (backed by `MetricsModule`) for counters and structured
  events; `MentorshipAccessPolicy`-style local `CapacityAccessPolicy` for
  authorization.
- `class-validator` / `@nestjs/swagger` for request validation and OpenAPI.
- The frontend MENTOR-041 work item supplies proposal ids, expiry deadlines and
  idempotency keys; those are client-supplied and validated on the server.

## Privacy boundary

- Policy limits are operational configuration; `pauseReason` is private to
  staff (it is hashed into the version hash but never returned to students).
- `inspectAllocation` is read-only and staff-only. Inspection reports the
  calculation and blocking codes; it never writes or overrides limits, so
  admins do not silently bypass checks.
- Reservation views expose ids, status and timing only — no free text.

## Rollout and rollback

- Additive: three new collections and new routes; no migration of existing
  mentor profiles or proposals. Safe to deploy behind the existing JWT guard.
- Rollback: remove `CapacityModule` from `AppModule`. Collections may be left
  in place (they are unreferenced); no live proposal state depends on them.
- Telemetry (`mentorship_capacity_*`) should be monitored for `rejected`,
  `idempotent`, `expired` and authz-denial outcomes. A sudden rise in
  `staleVersion` conflicts indicates concurrent policy edits or sweeps.

## Endpoint list

| Method | Route | Who |
|---|---|---|
| `POST` | `/mentorship/capacity/policies` | admin / moderator — define or re-publish a policy |
| `GET` | `/mentorship/capacity/mentors/:mentorId/allocation` | admin / moderator — read-only calculation |
| `POST` | `/mentorship/capacity/reservations` | mentor (self) or staff — reserve a proposal slot |
| `DELETE` | `/mentorship/capacity/reservations/:proposalId?mentorId=…` | mentor (self) or staff — release a slot |
| `POST` | `/mentorship/capacity/sweep` | admin / moderator — release expired reservations |

## Testing

Unit specs cover policy idempotency and stale versions, authorization denials,
reservation success, exhaustion and pause failures, idempotent release and the
expiry sweeper; controller specs verify delegation and guard metadata. Tests
were not run locally per the task instructions.
