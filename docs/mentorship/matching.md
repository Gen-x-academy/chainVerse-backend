# Mentor matching

Backend implementation of the Matching track:

| Work item | Issue | Scope |
|-----------|-------|-------|
| MENTOR-037 | #1317 | Match proposals: eligible participants, program, compatibility reasons, terms, expiry, initiator |
| MENTOR-038 | #1318 | Mutual acceptance: configured approvals, terms reconfirmation, atomic capacity, single engagement |
| MENTOR-039 | #1320 | Coordinator-assisted matching: propose/adjust/reassign with consent, hard checks enforced, reportable overrides |

Code lives in `src/mentorship/`. Routes are served under the global
`/api/v1` prefix.

## Concepts

| Concept | Collection | Notes |
|---------|------------|-------|
| Profile | `mentorship_profiles` | One per user per side (`mentor` / `mentee`). Holds focus areas, programs, hard `eligible` flag, and mentor capacity (`maxActiveMentees`, `reservedSlots`, `acceptingMentees`). |
| Block | `mentorship_blocks` | Blocks matching in both directions. Never overridable. |
| Proposal | `mentorship_match_proposals` | A proposed match with terms, approvals, coordinator record, overrides and an append-only reason history. |
| Engagement | `mentorship_engagements` | Created exactly once per accepted proposal. |

Mentors must hold the `tutor` role, mentees the `student` role. Mentor
profiles start **ineligible** until a coordinator approves them; mentee
profiles start eligible.

## Lifecycle

```
pending ──all required approvals──▶ activating ──▶ accepted (+ engagement)
   │                                    └─ failure / crash ─▶ pending
   ├─ reject ─────────▶ rejected
   ├─ withdraw ───────▶ withdrawn   (initiator, coordinator, block, eligibility revoked)
   ├─ expiresAt passes ▶ expired     (background sweeper)
   └─ reassignment ───▶ superseded  (coordinator)
```

Every transition is a single conditional MongoDB update on the expected
current state. Concurrent or retried requests either see the transition
already made (and get it back) or fail with a stable error code.

### Checks

**Hard checks** — nobody, coordinators included, can bypass them:
`self_match`, `mentor_profile_missing`, `mentee_profile_missing`,
`mentor_ineligible`, `mentee_ineligible`, `mentor_not_in_program`,
`mentee_not_in_program`, `blocked`, `already_engaged`, `mentor_at_capacity`.

**Soft checks** — participants cannot proceed; a coordinator may override
each one with a written reason: `mentor_not_accepting`,
`no_shared_focus_area`.

Hard checks run again when a participant approves, so a block or eligibility
revocation after creation still stops the match.

### Duplicate prevention

- **Proposals**: while open, a proposal holds `openKey = mentor:mentee:program`
  under a partial unique index. A second open proposal for the same triple
  fails with `BIZ_MENTORSHIP_DUPLICATE_PROPOSAL` (`details.existingProposalId`).
- **Engagements**: `proposalId` is unique, and an active engagement holds a
  unique `activeKey`. Simultaneous final approvals race for the
  `pending → activating` claim; only one wins, and even a replayed activation
  can't insert a second engagement.

### Terms and consent

- Each proposal has `termsVersion` and `termsHash` (SHA-256 of the
  canonicalised terms).
- Approving requires `termsVersion` (and optionally `termsHash`) plus
  `acceptTerms: true`. A mismatch returns `BIZ_MENTORSHIP_TERMS_STALE` with
  the current version and hash.
- Activation requires every role in `requiredApprovals` to have approved the
  **current** version and hash.
- A coordinator terms change bumps the version, clears **all** approvals and
  releases any capacity hold. Coordinators never approve for a participant.

### Capacity

`reservedSlots` = active engagements + open proposals holding a reservation.

1. The first approval on a proposal reserves a slot with one conditional
   update (`$expr: reservedSlots < maxActiveMentees`). A full mentor returns
   `BIZ_MENTORSHIP_CAPACITY_EXHAUSTED`.
2. The proposal's `capacityReserved` flag makes reserve and release
   idempotent.
3. Rejection, withdrawal, expiry, supersession and terms adjustment release
   the slot. On activation the slot passes to the engagement.
4. The sweeper reconciles `reservedSlots` with source data. It only applies a
   correction after seeing the same drift on two sweeps in a row, so it never
   mistakes an in-flight reservation for drift.

## API

All routes need a bearer token. Mutating `POST`/`PATCH` routes marked **idem**
require `X-Idempotency-Key`. A retry with the same key replays the first
response for 24 hours.

### Participants — `student`, `tutor`

| Method | Path | Notes |
|--------|------|-------|
| PUT | `/mentorship/profiles/me` | Upsert own profile (`kind`, `focusAreas`, `programIds`, mentor capacity fields) |
| GET | `/mentorship/profiles/me?kind=` | Own profile |
| POST | `/mentorship/blocks` | Block a user; withdraws open proposals between you. Idempotent |
| GET | `/mentorship/blocks` | Your blocks |
| DELETE | `/mentorship/blocks/:userId` | Unblock. Idempotent, 204 |
| POST | `/mentorship/proposals` | **idem**. Propose a match that includes you |
| GET | `/mentorship/proposals` | Proposals you take part in |
| GET | `/mentorship/proposals/:id` | 404 unless you are a participant |
| POST | `/mentorship/proposals/:id/approve` | `{ termsVersion, termsHash?, acceptTerms: true }`. Idempotent |
| POST | `/mentorship/proposals/:id/reject` | `{ reason? }`. Idempotent for the same actor |
| POST | `/mentorship/proposals/:id/withdraw` | Initiator only |
| GET | `/mentorship/engagements` | Your active engagements |

### Coordinators — `admin`, `moderator`

| Method | Path | Notes |
|--------|------|-------|
| POST | `/mentorship/coordinator/proposals` | **idem**. Needs `reason`; optional `overrides[]`, `internalNote`, `supersedesProposalId` (reassignment) |
| GET | `/mentorship/coordinator/proposals` | Filter by `status`, `mentorId`, `menteeId`, `programId` |
| GET | `/mentorship/coordinator/proposals/:id` | Full view including overrides and history |
| PATCH | `/mentorship/coordinator/proposals/:id` | **idem**. Change `terms` and/or `expiresInHours` with a `reason` |
| POST | `/mentorship/coordinator/proposals/:id/withdraw` | `{ reason }` |
| GET | `/mentorship/coordinator/overrides` | Override report: rows plus totals by check and coordinator; filters `from`, `to`, `coordinatorId`, `check` |
| PATCH | `/mentorship/coordinator/profiles/:userId/eligibility` | `{ kind, eligible, reason }`. Revoking withdraws open proposals on that side |

The full schemas are in Swagger (`/api/docs`), under the `mentorship` and
`mentorship-coordinator` tags.

## Authorization

- **Deny by default.** `MentorshipAccessGuard` rejects any mentorship route
  without an explicit `@Roles(...)` declaration, and any caller whose role
  isn't listed. The shared `RolesGuard` allows by default, so it isn't used
  here.
- **Object-level checks** are in the services. Participants can only read or
  act on proposals they belong to. Anyone else gets 404, so proposal ids
  reveal nothing. A participant can only create proposals that include
  themself. Only roles in `requiredApprovals` can approve. Only the initiator
  can withdraw.
- **Coordinator identity.** Every coordinator action records
  `coordinator.coordinatorId`, `overrides[].coordinatorId`, a history entry
  with actor and reason, and an audit-log entry from the request's
  `AuditContext`.

## Privacy boundaries

| Data | Participants | Coordinators |
|------|--------------|--------------|
| Match, terms, compatibility reasons, expiry, approval state | ✔ | ✔ |
| Coordinator id and public reason | ✔ | ✔ |
| Coordinator `internalNote`, overrides, reason history, initiator platform role | ✘ | ✔ |
| Block existence and reason | Blocker only | Block reason never exposed. Coordinators see `blocked` as a failed check |
| Counterpart eligibility state | Shown only as `counterpart_unavailable` | ✔ (`details.failedChecks`) |

Event payloads and metric labels carry ids or low-cardinality values only.
User ids never appear as metric labels.

## Errors

| Code | HTTP | When |
|------|------|------|
| `VAL_INVALID_INPUT` | 400 | DTO validation, self-block |
| `VAL_IDEMPOTENCY_KEY_MISSING` | 400 | **idem** route without `X-Idempotency-Key` |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403 | Role not allowed / no role declared / profile kind doesn't match role |
| `AUTH_MENTORSHIP_INITIATOR_MISMATCH` | 403 | Participant proposed a match that doesn't include them |
| `AUTH_MENTORSHIP_NOT_PARTICIPANT` | 403 | Approve without being a required approver; withdraw without being the initiator |
| `RES_MENTORSHIP_PROPOSAL_NOT_FOUND` | 404 | Unknown id, or caller isn't a participant |
| `RES_MENTORSHIP_PROFILE_NOT_FOUND` | 404 | No profile of that kind |
| `BIZ_MENTORSHIP_DUPLICATE_PROPOSAL` | 409 | Open proposal already exists (`details.existingProposalId`) |
| `BIZ_MENTORSHIP_PROPOSAL_NOT_PENDING` | 409 | Proposal already closed or activating (`details.status`) |
| `BIZ_MENTORSHIP_TERMS_STALE` | 409 | Terms changed since review (`details.currentTermsVersion`, `currentTermsHash`) |
| `BIZ_MENTORSHIP_CAPACITY_EXHAUSTED` | 409 | Mentor has no slot left |
| `BIZ_MENTORSHIP_ALREADY_ENGAGED` | 409 | Pair already has an active engagement in the program |
| `BIZ_MENTORSHIP_INELIGIBLE` | 422 | Hard checks failed (`details.failedChecks`) |
| `BIZ_MENTORSHIP_BLOCKED` | 422 | Match unavailable because of a block (deliberately generic) |
| `BIZ_MENTORSHIP_OVERRIDE_REQUIRED` | 422 | Soft checks failed and weren't overridden (`details.failedChecks`) |
| `BIZ_MENTORSHIP_OVERRIDE_UNNECESSARY` | 422 | Override supplied for a check that passed |
| `BIZ_MENTORSHIP_PROPOSAL_EXPIRED` | 422 | Approval after `expiresAt` |

The global exception filter now passes an optional `details` object through
to the response body.

## Telemetry

Counters appear on `/metrics` (`counters`) and `/metrics/prometheus`
(prefixed `chainverse_`):

| Counter | Labels |
|---------|--------|
| `mentorship_proposal_events_total` | `event` (created, approved, adjusted, rejected, withdrawn, expired, superseded), `initiator` / `side` / `termsChanged` |
| `mentorship_overrides_total` | `check` |
| `mentorship_activations_total` | `outcome` (activated, duplicate_suppressed, capacity_exhausted, already_engaged, error) |
| `mentorship_request_failures_total` | `code` (stable error code) |
| `mentorship_sweep_runs_total` | `phase` |
| `mentorship_capacity_drift_total` | — |

Structured logs from the `Mentorship` logger carry proposal, engagement and
coordinator ids. Audit actions are `mentorship_proposal.*`,
`mentorship_override.applied`, `mentorship_engagement.activated` and
`mentorship_profile.eligibility_changed`. A coordinator's attempt to create
a hard-ineligible match is audited with outcome `denied`.

Domain events for notification and payment consumers:
`mentorship.proposal-created`, `mentorship.proposal-adjusted`,
`mentorship.proposal-closed` and `mentorship.engagement-activated`.

## Background workflow

`MentorshipSweeper` runs on `MENTORSHIP_SWEEP_CRON`. It is disabled when
`NODE_ENV=test`. Each run:

1. Expires due pending proposals and releases their holds.
2. Recovers proposals stuck in `activating` for more than 2 minutes. If an
   engagement exists it marks the proposal accepted; otherwise it retries the
   activation, or rolls back to `pending` if capacity is gone.
3. Reconciles mentor capacity.

All steps reuse the API's conditional transitions, so running several
instances at once is safe. A per-process flag prevents overlapping runs.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MENTORSHIP_REQUIRED_APPROVALS` | `mentor,mentee` | Roles whose approval activates an engagement. Each proposal snapshots this at creation |
| `MENTORSHIP_PROPOSAL_TTL_HOURS` | `72` | Default proposal lifetime |
| `MENTORSHIP_PROPOSAL_MAX_TTL_HOURS` | `720` | Upper bound on requested lifetimes |
| `MENTORSHIP_SWEEP_CRON` | `0 */5 * * * *` | Sweeper schedule (6-field cron) |

## Dependencies

- `AuditModule` (global): immutable audit trail.
- `IdempotencyModule`: `X-Idempotency-Key` replay. This is the first
  controller to wire `IdempotencyInterceptor`.
- `MetricsModule`: adds the generic `MetricsService.increment` used for
  domain counters.
- `EventEmitterModule`: domain events.
- `ScheduleModule`: registered by `StellarModule`; the sweeper adds its job
  through `SchedulerRegistry`.
- JWT claims `sub` and `role` from `JwtAuthGuard`.

## Rollout

1. Deploy. Mongoose builds the new indexes on first start. With
   `autoIndex` disabled in production, create them ahead of time: the
   partial-unique `openKey` and `activeKey` indexes and the unique
   `proposalId` and `{userId, kind}` indexes.
2. Coordinators approve mentor profiles before any matching is possible.
   Nothing activates by accident.
3. Watch `mentorship_request_failures_total` and
   `mentorship_capacity_drift_total`. Sustained drift points to crashes
   mid-reservation.
4. `MENTORSHIP_REQUIRED_APPROVALS` can be narrowed later. Existing proposals
   keep the approvals they were created with.
5. To roll back, remove `MentorshipModule` from `AppModule`. The collections
   are self-contained and no other module reads them.

Not in scope here: ending an engagement (which would release its slot),
on-chain escrow for the agreed terms, and notification templates. Those
consume the events above.

## Related work in other ChainVerse repositories

The issues pair each work item with matching work in the other ChainVerse
repositories. The issue text doesn't name those repositories, so the items
below describe what the counterpart work needs from this API:

- **Frontend — MENTOR-037/038/039:** proposal creation and coordinator
  consoles; showing terms with `termsVersion`/`termsHash` and sending them
  back on approval; handling `BIZ_MENTORSHIP_TERMS_STALE` by refetching and
  asking the user to reconfirm; the coordinator override report.
- **Smart contracts — MENTOR-038:** escrow or payment setup driven by
  `mentorship.engagement-activated`, with `termsHash` as the agreed-terms
  commitment.
