# Issue #1330 — Prevent Blocked-User Matching (MENTOR-044)

## Purpose

A mentorship block must be a hard, bidirectional, non-overridable constraint: once either
participant blocks the other, the pair can never be discovered, recommended, proposed,
activated or rematched. This module (`src/mentorship/blocking/`) provides the one
authoritative API for that rule and a reusable guard so every matching entry point can
enforce it the same way.

Shared work item: **MENTOR-044** (cross-repository; the frontend/mobile clients must
hide blocked users locally and must never attempt to infer block state from error
responses).

## Dependencies

| Dependency | Role |
|---|---|
| `src/mentorship/schemas/mentorship-block.schema.ts` | Canonical `mentorship_blocks` collection, with the unique compound index `{ blockerId: 1, blockedId: 1 }` that makes creation idempotent. The feature re-exports it rather than creating a second collection. |
| `MentorshipEligibilityService` / `HardCheck.BLOCKED` | Existing eligibility evaluation already flags blocked pairs; new call sites should additionally call `MentorshipBlockingService.isBlocked` / `assertNotBlocked` before any state change. |
| `MentorshipErrors.blocked()` / `ErrorCode.BIZ_MENTORSHIP_BLOCKED` | Stable, already-established generic response used by the matching flows. |
| `JwtAuthGuard`, `@CurrentUser('sub')`, `ParseObjectIdPipe` | Authentication and validated identifiers on the management endpoints. |
| `MentorshipTelemetry` + `MetricsModule` | Low-cardinality counters (`mentorship_block_create_total`, `mentorship_block_remove_total`, `mentorship_block_enforcement_total`, `mentorship_block_filter_total`, `mentorship_block_authz_denied_total`) and structured audit events. All telemetry is guarded so a metrics outage never changes a business outcome. |
| `class-validator` / `@nestjs/swagger` | DTO validation and OpenAPI documentation. |

## Authoritative service API

`MentorshipBlockingService` is exported by `MentorshipBlockingModule` and should be the
only way new code reads or writes blocks:

- `isBlocked(a, b): Promise<boolean>` — bidirectional read; never mutates, safe to retry.
- `assertNotBlocked(a, b, entryPoint?)` — throws the generic `BIZ_MENTORSHIP_BLOCKED`
  "This match is not available" response. Used by proposal/provider/rematch flows.
- `filterBlockedIds(callerId, candidateIds)` — silently removes blocked and self
  candidates from discovery and recommendation result sets, without emitting any signal
  about why they disappeared. This is the preferred path for list endpoints.
- `block(actorId, dto)` — idempotent conditional upsert; the unique index plus
  `$setOnInsert` means a retry never duplicates or rewrites a block or its reason.
- `unblock(actorId, userId)` — deletes only a block owned by the caller; idempotent.
- `listOwnBlocks(actorId)` — lists only the caller's blocks.

## Reusable guard pattern for other entry points

`MentorshipBlockGuard` plus the `@SetBlockTarget(...)` decorator let any handler opt in
without bespoke logic:

```ts
@UseGuards(MentorshipBlockGuard)
@SetBlockTarget({ key: 'mentorId' })          // or { key: 'menteeId', source: 'body' }
@Get(':mentorId')
detail(@Param('mentorId') mentorId: string) { /* ... */ }
```

The guard denies by default when metadata is missing, the caller is unauthenticated, or
the counterpart id cannot be resolved, and otherwise calls `assertNotBlocked` with the
route name as the low-cardinality telemetry label. Intended opt-in surfaces:

| Entry point | Recommended enforcement |
|---|---|
| Mentor directory / catalog / detail | `filterBlockedIds` on results; guard on detail |
| Recommendations / shortlists / comparison | `filterBlockedIds` before ranking |
| Proposal creation and approval | `assertNotBlocked` / guard before any write or activation |
| Coordinator queue, assignment and override tools | `assertNotBlocked` — coordinators have **no** bypass |
| Rematches and superseding proposals | `assertNotBlocked` before issuing a new proposal |

Applying the guard to an unrelated module is intentionally left to that module's owner;
this change stays limited to the blocking feature and its registration in `app.module.ts`.

## Privacy boundary

- Blocks apply in **both** directions regardless of who created them; no direction is
  reported to a participant.
- The free-text `reason` is private to its author. The blocked user, coordinators and
  third parties never receive it; shared proposal closure uses the generic
  `participant_unavailable` wording.
- `listOwnBlocks` filters by `blockerId = caller`, so it can only return the caller's own
  records, and the response view omits `blockerId` entirely.
- Discovery and recommendations use silent exclusion, so neither the existence nor the
  author of a block can be inferred from counts, errors or timing.
- The generic `BIZ_MENTORSHIP_BLOCKED` response carries no details, reason or actor, and
  matches the response already emitted by the pre-existing matching flows.
- No endpoint exists to inspect or delete another user's block; `BlockingPolicy` denies
  that by default with `MENTOR_ACCESS_DENIED`.

## Immutability, idempotency and errors

- The block collection is append-only for creation: retries upsert on `{ blockerId,
  blockedId }` with `$setOnInsert`, and a duplicate-key race returns the canonical row.
- Removal is the only mutation and is idempotent (`deletedCount` 0 is a successful no-op).
- Self-blocking is rejected with `VAL_INVALID_INPUT` before any write.
- All errors use existing stable codes: `VAL_INVALID_INPUT`,
  `BIZ_MENTORSHIP_BLOCKED`, `MENTOR_ACCESS_DENIED`.

## Rollout and rollback

- Deploy the module and registration first; it adds one controller prefix
  (`/api/v1/mentorship/blocking`) and no schema migration (the collection and its unique
  index already exist). The index must be verified present before enabling enforcement.
- Roll out opt-in guards on read surfaces first (silent filtering), then on proposal
  activation and coordinator/rematch tools. This ordering avoids exposing a new error to
  discovery clients while enforcement is still being validated.
- Rollback is per-surface: remove the `@UseGuards`/`@SetBlockTarget` lines from a handler
  to stop enforcement there; the blocking module and its existing block data remain
  intact and can be rolled back independently.
- Monitor the five block counters; a sharp rise in `mentorship_block_filter_total` or
  `mentorship_block_enforcement_total` may indicate a client retry loop or a data issue.
- No existing block documents are rewritten by this change, so rollback needs no data
  repair.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/mentorship/blocking/blocks` | Create an idempotent bidirectional block; private reason stored on the blocker's record only. |
| `GET` | `/api/v1/mentorship/blocking/blocks` | List only the caller's blocks; responses omit `blockerId`. |
| `DELETE` | `/api/v1/mentorship/blocking/blocks/:userId` | Remove one of the caller's own blocks; idempotent. |

All endpoints require a bearer token (`@ApiBearerAuth('access-token')`).

## Tests

- DTO specs cover valid/invalid targets and private reasons under the global pipe options.
- Service specs cover bidirectional detection, generic blocked errors, silent filtering,
  idempotent create and duplicate-key races, self-block rejection, own-only removal,
  privacy of list responses and telemetry-failure tolerance.
- Guard specs cover deny-by-default configuration, authentication/target resolution,
  both param and body targets, and propagation of the generic blocked error.

## References

- GitHub issue: [#1330](https://github.com/Gen-x-academy/chainVerse-backend/issues/1330)
- Cross-repository work item: MENTOR-044
- Related guidance: `docs/mentorship/discovery-abuse-controls.md`, `docs/mentorship/matching.md`
