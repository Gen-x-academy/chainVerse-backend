# Project Planning Workspace

Backend scope for **#1571** (objective progress check-ins), **#1572** (risks and mitigations),
**#1573** (timeline and roadmap), and **#1574** (deadline extension requests).

The module is `src/project-planning/` and is registered in `src/app.module.ts`. It uses
in-memory, tenant-keyed repositories, so it is additive and requires no migration.

## API

All routes are mounted under `/api/v1/planning/tenants/{tenantId}` by the application's global
prefix and URI versioning. Every route requires `Authorization: Bearer <JWT>`; the JWT must
carry `sub`, `email` and `role`.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| POST | `/projects` | Create a project; creator becomes owner |
| GET | `/projects` | List projects visible to the caller |
| POST | `/projects/{projectId}/members` | Grant a project role |
| POST | `/projects/{projectId}/objectives` | Create an objective |
| GET | `/projects/{projectId}/objectives` | List objectives and current percentage |
| POST | `/objectives/{objectiveId}/check-ins` | Record a progress check-in |
| GET | `/objectives/{objectiveId}/check-ins` | List redacted check-in metadata |
| POST | `/projects/{projectId}/risks` | Register a risk with severity and likelihood |
| GET | `/projects/{projectId}/risks` | List risks and mitigation metadata |
| POST | `/risks/{riskId}/mitigations` | Add a mitigation with an owner |
| POST | `/projects/{projectId}/phases` | Append a roadmap phase |
| GET | `/projects/{projectId}/roadmap` | List phases in date order |
| POST | `/projects/{projectId}/extension-requests` | Request a deadline extension |
| GET | `/projects/{projectId}/extension-requests` | List redacted extension requests |
| POST | `/extension-requests/{requestId}/decision` | Approve or reject a request |

Swagger decorators on `ProjectPlanningController` publish all operations in the generated
OpenAPI document (`/api/docs`).

## Roles and tenant boundary

- Platform roles: `admin`, `moderator`, `tutor` may create projects. `admin` and `moderator`
  may read across projects in their tenant; `student` and `librarian` have no implicit access.
- Project roles: `owner`, `planner`, `viewer`, `approver`. The owner and planners may record
  check-ins, risks, mitigations, phases and extension requests. Viewers and approvers have
  read access. Approvers (or the owner/platform admin) may decide extension requests.
- Access is deny-by-default: missing identity, unknown role, absent project membership or a
  tenant mismatch returns `403`; a resource that does not exist in the addressed tenant
  returns `404` without revealing whether it exists elsewhere.
- Requests are rejected when the JWT role is not one of the roles recognized by the global
  `RolesGuard`, and the service re-checks identity, tenant and project membership for every
  operation.

## Validation and domain rules

DTOs use `class-validator`; the global `ValidationPipe` whitelists unknown fields.

- Check-in percentage must be an integer from 0 to 100. A decrease requires a non-empty
  `regressionReason`, otherwise the mutation fails with `BIZ_INVALID_STATE_TRANSITION`.
- Risks require `severity` and `likelihood`. Adding a mitigation requires both `ownerId` and
  `plan`; only one mitigation can be attached to a risk.
- Roadmap phases must have `endDate > startDate` and must not overlap earlier phases.
- Extension requests require a non-empty `reason` and 1–90 requested days. The requester can
  never decide their own request (`BIZ_SEPARATION_OF_DUTIES`). Approval extends the project
  deadline from the deadline captured when the request was made.
- All mutation DTOs require an `idempotencyKey` matching `^[A-Za-z0-9._-]{8,128}$`.

## Idempotency and concurrency

Keys are scoped to tenant, actor and operation. A retry with the same key and payload returns
the stored response; reusing a key with a different payload returns `409`
(`BIZ_IDEMPOTENCY_KEY_REUSED`). Executions for the same key are serialized by an in-process
mutex so concurrent retries cannot create duplicate records. Only hashes and redacted
responses are retained for replay.

## Audit and privacy

`PlanningAuditService` records metadata only: action, tenant, actor id and roles, resource type
and id, outcome, fingerprint, request hash and timestamp. Check-in notes, regression reasons,
mitigation plans, extension reasons and decision notes are never logged or returned; responses
expose presence flags such as `hasNote` and `hasReason`. No log statements emit request
payloads.

## Testing

```bash
npx jest --runTestsByPath \
  src/project-planning/dto/project-planning.dto.spec.ts \
  src/project-planning/project-planning.service.spec.ts \
  src/project-planning/project-planning.controller.spec.ts \
  --runInBand
```

The specs cover validation, the four operations, domain rules, tenant isolation, authorization
denials, idempotent/concurrent retries, audit redaction and HTTP integration.

## CAPSTONE cross-repository references

- Backend contract: this workspace and generated OpenAPI are the source of truth for issues
  #1571–#1574 in `Gen-x-academy/chainVerse-backend`.
- Client work in the other ChainVerse repositories should route tenant-scoped calls through
  the authenticated API and display only the redacted response fields; private notes and
  reasons must never be placed in URLs, logs or telemetry.
- No changes are required in `chainVerse-onchain`; deadline extensions are backend records.
- Documentation style follows `docs/mentorship/deliverables-and-timeline.md` and
  `docs/mentorship-directory-and-programs.md` (module map, API table, key rules, rollout and
  cross-repository dependencies).
