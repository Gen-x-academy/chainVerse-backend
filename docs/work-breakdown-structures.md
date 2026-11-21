# Work Breakdown Structures — CAPSTONE-058

## Overview

The Work Breakdown Structures (WBS) capability lets platform staff and tutors decompose capstone and research projects into ordered, weighted work packages with tasks, explicit dependency edges, effort estimates, assignees, and acceptance criteria.

---

## Repository context

| Repository | Ticket | Notes |
|---|---|---|
| chainVerse-backend (this) | CAPSTONE-058 | API, domain logic, persistence |
| chainVerse-frontend | CAPSTONE-058 | UI for WBS editor and progress dashboard |

---

## Module location

```
src/work-breakdown/
  work-breakdown.module.ts          # NestJS module declaration
  work-breakdown.controller.ts      # HTTP routes
  work-breakdown.service.ts         # Domain logic, idempotency, authorisation
  work-breakdown.repository.ts      # In-memory data store (Map-of-Maps, tenant-isolated)
  work-breakdown-audit.service.ts   # Append-only audit log (no private payloads)
  work-breakdown.types.ts           # Enums, record types, view types
  dto/work-breakdown.dto.ts         # Validated input DTOs (class-validator)
  work-breakdown.service.spec.ts    # Unit tests
  work-breakdown.integration.spec.ts# Integration tests (multi-step workflows)
```

E2E / authorization tests live at `test/work-breakdown.e2e-spec.ts`.

---

## API base path

All routes are prefixed `/api/v1/wbs/tenants/:tenantId`.

### WBS routes

| Method | Path | Role required | Description |
|--------|------|--------------|-------------|
| `POST` | `/wbs` | admin / moderator / tutor | Create a new WBS for a project |
| `GET` | `/projects/:projectId/wbs` | any authenticated | List all WBS structures for a project |
| `GET` | `/wbs/:wbsId` | any authenticated | Retrieve a single WBS |
| `PATCH` | `/wbs/:wbsId` | admin / moderator / tutor | Update title, description, or package order |

### Work package routes

| Method | Path | Role required | Description |
|--------|------|--------------|-------------|
| `POST` | `/wbs/:wbsId/packages` | admin / moderator / tutor | Create an ordered work package |
| `GET` | `/wbs/:wbsId/packages` | any authenticated | List packages (ordered by `order` field) |
| `GET` | `/packages/:packageId` | any authenticated | Get a single package |
| `PATCH` | `/packages/:packageId` | package OWNER / PLANNER / EXECUTOR | Update title, assignees, criteria, weight |
| `POST` | `/packages/:packageId/status` | package role | Advance lifecycle state |
| `POST` | `/packages/:packageId/estimate` | package role | Set / replace effort estimate |
| `POST` | `/packages/:packageId/roles` | package OWNER | Assign a role to a user |

### Dependency routes

| Method | Path | Role required | Description |
|--------|------|--------------|-------------|
| `POST` | `/wbs/:wbsId/dependencies` | admin / moderator / tutor | Add a dependency edge |
| `GET` | `/wbs/:wbsId/dependencies` | any authenticated | List dependency edges |
| `DELETE` | `/dependencies/:dependencyId` | admin / moderator / tutor | Remove a dependency edge |

### Task routes

| Method | Path | Role required | Description |
|--------|------|--------------|-------------|
| `POST` | `/packages/:packageId/tasks` | package role | Create a task |
| `GET` | `/packages/:packageId/tasks` | any authenticated | List tasks |
| `PATCH` | `/tasks/:taskId` | package role | Update task (title, done, assignee, dueAt) |

### Progress route

| Method | Path | Role required | Description |
|--------|------|--------------|-------------|
| `GET` | `/wbs/:wbsId/progress` | any authenticated | Weighted progress report |

---

## Domain rules

### Package lifecycle (status machine)

```
PENDING → IN_PROGRESS → REVIEW → DONE
                     ↘ BLOCKED → IN_PROGRESS
                     ↘ CANCELLED
PENDING → CANCELLED
```

Illegal transitions produce `HTTP 422 BIZ_INVALID_STATE_TRANSITION`.

- Transitioning to `BLOCKED` **requires** a `blockerNote` in the request body.
- Transitioning to `DONE` **requires** every declared dependency to already be `DONE`.
- Once a package reaches `DONE` or `CANCELLED` (terminal states), it may not be mutated further.

### Dependency integrity

- Self-loops are rejected with `HTTP 400`.
- Duplicate edges are rejected with `HTTP 409 RES_ALREADY_EXISTS`.
- Any edge that would introduce a cycle (detected via BFS) is rejected with `HTTP 422 BIZ_INVALID_STATE_TRANSITION`.
- Removing a dependency also removes the reference from the target package's `dependsOn` list.

### Package ordering

The parent WBS maintains an `orderedPackages` array. Each new package is appended automatically. Callers may reorder via `PATCH /wbs/:wbsId` with a full `orderedPackages` array; the array must reference **exactly** the current set of packages in the WBS (no extra, no missing).

### Progress weights

Each work package carries a `progressWeight` (integer 0–100, default 1). The progress report computes:

```
progressPercent = round(completedWeight / totalWeight * 100)
```

where `completedWeight` is the sum of weights for `DONE` packages.

### Estimates

Estimates carry a `value` (non-negative integer) and a `unit` (`story_points`, `hours`, `percentage`). They may be set or replaced at any time before the package reaches a terminal state.

---

## Authorization

**Deny-by-default.** Every route requires a valid Bearer JWT (the global `JwtAuthGuard`).

| Operation | Minimum platform role | Package-level role |
|---|---|---|
| Create WBS / package / dependency | `admin`, `moderator`, `tutor` | — |
| Update WBS | `admin`, `moderator`, `tutor` | — |
| Advance status / set estimate / create task | any (bypassed by platform role) | `OWNER`, `PLANNER`, `EXECUTOR` |
| Assign roles on package | any (bypassed by platform role) | `OWNER` only |
| Read (list / get) | all authenticated roles | — |

Tenant boundaries are enforced: the `tenantId` in the JWT claim is compared against the `:tenantId` path parameter. Cross-tenant reads/writes produce `HTTP 403 AUTH_INSUFFICIENT_PERMISSIONS`.

---

## Idempotency

All mutating endpoints require an `idempotencyKey` (pattern `^[A-Za-z0-9._-]{8,128}$`). Duplicate requests with the same `(tenantId, actorId, operation, idempotencyKey)` tuple return the cached response. Reusing a key with a different payload returns `HTTP 409 BIZ_IDEMPOTENCY_KEY_REUSED`.

Concurrent duplicate requests are serialised per key via a promise-chain lock, preventing double-writes.

---

## Sensitive-field policy

- Idempotency keys are **never** returned to callers.
- Package `roles` maps (internal roles) are **not** returned in view objects.
- Audit entries contain no private payload fields (only resource IDs, actor IDs, and operation metadata).

---

## Observability

Mutations are recorded by `WorkBreakdownAuditService` (in-process, singleton). Each entry records:
- `action` — dotted operation name (e.g. `wbs.create:proj-id`)
- `tenantId`, `actorId`, `actorRoles`
- `resourceType`, `resourceId`
- `fingerprint` — SHA-256 of the stable-serialised payload
- `requestHash` — SHA-256 of `tenantId|actorId|operation|idempotencyKey`
- `timestamp` (ISO-8601)

No private data is recorded in audit entries.

---

## Privacy boundaries

- `WorkPackageRecord.roles` is excluded from view objects.
- Estimates do record `addedBy` (actor ID), consistent with the existing planning domain pattern.
- No PII fields exist in WBS entities. Assignee/actor identifiers are opaque user IDs.

---

## Rollout and rollback considerations

**Rollout:**
1. Deploy the new `WorkBreakdownModule`. No schema migrations are required (in-memory repository).
2. Update the OpenAPI document (auto-generated at `/api/docs` in non-production).
3. Enable the frontend CAPSTONE-058 feature flag pointing at the new endpoints.

**Rollback:**
1. Remove the `WorkBreakdownModule` import from `AppModule`.
2. No database cleanup is needed (in-memory data is not persisted across restarts).

If a persistent store is introduced in a future iteration, a migration script will be required; the rollback plan at that point is to run the down-migration.

---

## Limitations and future work

- The repository is **in-memory only**. All data is lost on application restart. A MongoDB-backed repository (following the `ProjectWorkspaceModule` pattern) is recommended for production.
- No pagination on list endpoints — acceptable for the current expected data volume; add cursor-based pagination when package counts grow beyond ~200 per WBS.
- No WebSocket / real-time progress push — polling the `/progress` endpoint is the current approach.
