# Project Milestones (CAPSTONE-060)

The project-milestones module provides ordered, tenant-scoped milestone definitions for project
planning. It is additive and registered under `/api/v1/milestones/tenants/{tenantId}`.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/projects` | Register or update a project membership stub |
| POST | `/projects/{projectId}/milestones` | Create a DRAFT milestone |
| GET | `/projects/{projectId}/milestones` | List project milestones in sequence order |
| GET | `/milestones/{milestoneId}` | Get a redacted milestone |
| PATCH | `/milestones/{milestoneId}` | Update a DRAFT milestone |
| POST | `/milestones/{milestoneId}/transitions` | Apply a lifecycle transition |
| POST | `/milestones/{milestoneId}/reviewer` | Assign or replace a reviewer |
| GET | `/audit` | Read tenant milestone audit metadata |

Mutating requests require an `idempotencyKey`. Swagger publishes the DTOs and stable HTTP
responses through `/api/docs`.

## Lifecycle and validation

- Sequence numbers are assigned monotonically inside a project.
- Valid transitions are DRAFT to ACTIVE/CANCELLED and ACTIVE to COMPLETED/CANCELLED.
- COMPLETED and CANCELLED are terminal.
- A milestone cannot become ACTIVE until every dependency is in the project and COMPLETED.
- Dependency lists are cycle checked on create and update.
- Cancellation requires a non-empty reason.
- A designated reviewer, project owner, or platform admin completes a milestone.
- Due dates must be valid ISO-8601 values. Private descriptions, deliverables, completion criteria,
  and cancellation reasons are omitted from normal views and audit entries.

## Authorization and privacy

Access is deny-by-default. Project membership roles are owner, planner, reviewer, and viewer.
Platform admins and moderators may administer tenant milestones; tutors may register a project
stub and manage it through project membership rules. Unknown roles and cross-tenant identifiers
are denied or return not-found responses. Audit entries contain only actors, tenant, action,
resource IDs, outcomes, hashes, fingerprints, and timestamps.

## Concurrency and dependencies

Idempotency keys are scoped by tenant, actor, and operation. Matching retries replay the response;
payload reuse conflicts are rejected. In-process locks serialize concurrent mutations. The
repository is tenant-keyed and in-memory, matching the other CAPSTONE bounded-context modules.
It depends on JWT claims, the global validation pipe, project membership stubs, and optional
opaque funding references. No queue or external database is required.

## Rollout and rollback

Enable `ProjectMilestonesModule` with the API deployment and monitor `RES_MILESTONE_NOT_FOUND`,
`BIZ_MILESTONE_*`, and `BIZ_IDEMPOTENCY_KEY_REUSED` responses. Rollback is a module-import removal
with no migration; in-memory milestone and audit state is process-local and disappears on restart.

## CAPSTONE cross-repository references

- **CAPSTONE-060** backend source of truth: this module and generated OpenAPI.
- Frontend/mobile milestone boards should consume only redacted views and ordered sequences.
- Funding UIs may submit opaque `fundingReferenceId` values and must not infer budget data here.
- CAPSTONE-077 through CAPSTONE-080 review deliverables remain owned by `review-outcomes`;
  milestone completion should consume their externally completed status.
