# Dependency Cycles and Schedule Risk (CAPSTONE-059)

Task-level schedule graph for a project: finish-to-start dependencies that can never form a cycle,
plus an on-demand analysis that surfaces the critical path, impossible dates, resource conflicts,
blocked critical paths and deadline risk. Additive, in-memory and tenant-keyed (same model as
`project-milestones`); no migration. Routes live under `/api/v1/schedule-risk/tenants/{tenantId}`.
The milestone dependency graph in `project-milestones` is a different, coarser structure and is
untouched.

## API

| Method | Route | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/projects` | admin, moderator (create); project owner/planner (replace) | Register a project membership stub and deadline |
| POST | `/projects/{projectId}/tasks` | project owner/planner, admin, moderator | Create a task with dependencies |
| GET | `/projects/{projectId}/tasks` | any project member, admin, moderator | List tasks by start date |
| GET | `/tasks/{taskId}` | any project member, admin, moderator | Get one task |
| PATCH | `/tasks/{taskId}` | project owner/planner, admin, moderator | Edit (needs `expectedVersion`) |
| POST | `/tasks/{taskId}/transitions` | project owner/planner, admin, moderator | Change status (needs `expectedVersion`) |
| GET | `/projects/{projectId}/analysis?asOf=YYYY-MM-DD` | any project member, admin, moderator | Compute the analysis (read-only) |
| POST | `/projects/{projectId}/analysis/snapshots` | project owner/planner, admin, moderator | Record a snapshot and notify new findings |
| GET | `/projects/{projectId}/analysis/snapshots` | any project member, admin, moderator | List snapshots |
| GET | `/audit` | admin, moderator | Audit metadata |

Every mutation requires an `idempotencyKey` (`^[A-Za-z0-9._-]{8,128}$`). Swagger documents DTOs and
error responses at `/api/docs`.

## Rules

- **Dates** are day-granular UTC (`YYYY-MM-DD`), end date inclusive. `endDate` before `startDate` is
  rejected (`VAL_SCHEDULE_DATES_INVALID`).
- **Dependencies** are finish-to-start, must be tasks of the same project (`BIZ_SCHEDULE_DEPENDENCY_UNKNOWN`),
  at most 20 per task, at most 200 tasks per project (`BIZ_SCHEDULE_LIMIT_EXCEEDED`).
- **Cycles are rejected at write time.** An edit that would make a task reachable from itself
  (including a self-dependency) fails with `BIZ_SCHEDULE_DEPENDENCY_CYCLE` (422) and
  `details.cycle` lists the task ids around the loop. The graph and version are left unchanged.
  Because all writes in a tenant are serialised, two concurrent edits cannot jointly create a cycle.
- **Lifecycle:** `planned → in_progress | blocked | cancelled`, `in_progress → blocked | done | cancelled`,
  `blocked → planned | in_progress | cancelled`; `done` and `cancelled` are terminal
  (`BIZ_SCHEDULE_INVALID_TRANSITION`, `BIZ_SCHEDULE_TASK_CLOSED`). Starting or finishing a task needs
  every predecessor `done` or `cancelled` (`BIZ_SCHEDULE_PREDECESSORS_OPEN`).
- **Stale requests:** each change increments `version`; a mismatched `expectedVersion` returns
  `BIZ_SCHEDULE_STALE_VERSION` (409) with `details.currentVersion`.

## Analysis

Computed from the stored tasks and the project deadline at `asOf` (default: today, UTC). Cancelled
tasks are ignored; done tasks are satisfied predecessors with no remaining work. Remaining work cannot
start before `asOf` or before its predecessors' projected finish, which gives each task a projected
start/end and slack. Tasks with zero slack form the critical path.

| Finding | Codes | Severity |
| --- | --- | --- |
| `impossible_dates` | `START_BEFORE_PREDECESSOR_END`, `END_IN_PAST`, `START_IN_PAST` | high / medium |
| `resource_conflict` | `ASSIGNEE_OVERLAP` (same assignee, overlapping open tasks; capped at 50, `conflictsTruncated`) | high if both critical, else medium |
| `blocked_critical_path` | `BLOCKED_ON_CRITICAL_PATH` (lists the blocked task and the critical work it holds up) | critical |
| `deadline_risk` | `DEADLINE_EXCEEDED` (projected finish after the deadline), `DEADLINE_AT_RISK` (within 5 days) | critical / high |
| `dependency_cycle` | `CYCLE_DETECTED` (defensive only; write-time checks should make it unreachable) | critical |

`deadlineStatus` is `no_deadline`, `complete`, `on_track`, `at_risk` or `late`, with `marginDays`.

## Privacy

- Findings carry task ids and fixed codes only, never titles or free text.
- Viewers see tasks without `assigneeId` (only `assigned: true/false`) and analyses without assignee
  ids. Owners, planners and platform admins see them.
- Non-members get `RES_NOT_FOUND`, so project existence is not disclosed.
- Audit entries hold ids, roles, outcome, request hash and payload fingerprint (success, denied and
  failed attempts). They contain no titles, assignees or dates.
- Notifier events and snapshots contain finding type, code, severity and task ids only.

## Notifications and snapshots

A snapshot stores counts by severity, deadline status and margin. When a `SCHEDULE_RISK_NOTIFIER`
provider is registered, each `critical`/`high` finding is delivered at most once per project (keyed by
type, code and task ids). A failed delivery does not fail the request; it is counted in
`notificationsFailed` and retried by a later snapshot. Replays of the same idempotency key return the
stored snapshot without notifying again. Without a notifier, snapshots are recorded and nothing is sent.

## Dependencies, rollout and rollback

- Depends only on the shared guards, error codes and `ProjectScheduleRiskModule` in `AppModule`; it does
  not read `project-milestones`, `project-planning` or any database.
- Rollout: additive module and error codes, no migration. Register projects (membership stub and
  deadline) before creating tasks. To receive alerts, provide `SCHEDULE_RISK_NOTIFIER` and call the
  snapshot endpoint from a scheduler.
- Rollback: remove `ProjectScheduleRiskModule` from `AppModule`. State is in memory, so nothing needs
  reverting.

## Known limitations

- Storage is in memory: data is lost on restart and not shared between instances. There is no
  background job; snapshots run when the endpoint is called.
- The JWT has no tenant claim, so the `tenantId` path segment is the tenant boundary, as in the other
  project modules.
- Durations are calendar days; there is no working-calendar, holiday or part-time handling, and only
  finish-to-start dependencies are supported.
- Metrics/dashboards are not emitted; the audit log and snapshots are the observability surface.

## Corresponding work in other repositories

CAPSTONE-059 in the frontend and other repositories: links to be added by the owners of those
repositories.
