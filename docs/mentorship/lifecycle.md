# Mentorship lifecycle state machine (MENTOR-004)

Backend implementation of the shared MENTOR-004 work item in the Foundation track. Code lives in
`src/mentorship/lifecycle/`.

## States

`draft`, `published`, `accepting`, `matched`, `active`, `paused`, `completed`, `cancelled`, `disputed`, `archived`.

## Transitions

The transition table is the whole policy (`mentorship-lifecycle.machine.ts`). A pair not listed is forbidden for everyone,
and a listed pair is open only to the listed actor kinds, so access is denied by default.

| From | To | Who |
| --- | --- | --- |
| draft | published, archived, cancelled | owner, admin |
| published | draft, accepting, archived, cancelled | owner, admin |
| accepting | published, archived, cancelled | owner, admin |
| accepting | matched | system, admin |
| matched | accepting | system, admin |
| matched | active | owner, system, admin |
| matched, active, paused | cancelled | owner, mentee, admin |
| active | paused | owner, mentee, admin |
| paused | active | owner, mentee, admin |
| active | completed | owner, system, admin |
| matched, active, paused, completed | disputed | owner, mentee, admin |
| disputed | active, completed, cancelled | **admin only** |
| completed, cancelled | archived | owner, system, admin |

`archived` is final. Every state is reachable from `draft`.

**Actor kinds** are `owner` (the mentor), `mentee`, `admin` and `system` (a background workflow such as matching). The
caller of the service decides which kind an authenticated request is, from the principal and the mentorship's participants;
the service trusts the actor it is given.

## Behaviour

- **Idempotent.** Asking for the state a mentorship is already in succeeds with `changed: false` and records nothing, so a
  client can retry after a timeout.
- **Stable errors.** A move that is not an edge returns `BIZ_MENTORSHIP_TRANSITION_FORBIDDEN` (422) and names the allowed
  next states. An edge the actor may not use returns `AUTH_INSUFFICIENT_PERMISSIONS` (403). A missing or unusable reason
  returns `VAL_MENTORSHIP_REASON_REQUIRED` (400). A lost race returns `BIZ_MENTORSHIP_LIFECYCLE_CONFLICT` (409).
- **Reasons.** Required to cancel, pause or dispute, and for any move out of a dispute; optional otherwise; at most 500
  characters; stored trimmed. Authorisation is checked first, so an unauthorised caller learns nothing about reasons.
- **Audit.** Every change appends one row to `mentorship_lifecycle_events` with the prior state, the new state, the actor,
  the reason and the time. The collection is unique on `(mentorshipId, sequence)`, so a replay cannot add a second row.
- **Concurrency.** The state is updated only if both the version and the state still match what was read; otherwise
  nothing is written.

## Persistence

| Collection | Purpose |
| --- | --- |
| `mentorship_lifecycles` | Current `state` and `version` per mentorship (unique on `mentorshipId`) |
| `mentorship_lifecycle_events` | Append-only history |

No existing data changes. If `autoIndex` is off in an environment, create the two unique indexes before use.

## Known gaps

- **No HTTP routes.** There is no mentorship aggregate yet to attach a route to, and the permission matrix that maps users
  to `owner` and `mentee` for a given mentorship (MENTOR-003) is separate work. `MentorshipLifecycleModule` exports
  `MentorshipLifecycleService` for those features to call; a REST surface should be added with them.
- **State and audit row are two writes.** The state update is guarded and atomic; the audit row is written right after.
  A crash between the two leaves a correct state with a missing audit row. Writing both in one transaction, or through the
  outbox, is the follow-up.
- **Telemetry.** Errors carry stable codes; no metrics are emitted yet.
- **Other repositories.** The matching MENTOR-004 work in the other ChainVerse repositories should use the same state
  names and transition table.
