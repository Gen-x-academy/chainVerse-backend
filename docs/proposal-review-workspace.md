# Proposal review workspace

The proposal review workspace covers four workstreams: review queues (#1583), configurable rubrics (#1584), independent reviews (#1585), and blinded review modes (#1586). The module is self-contained at `src/proposal-review/` and is registered once in `src/app.module.ts`.

## Trust boundary and actor context

Every request must carry three headers, injected by the gateway from verified identity claims. Client-supplied values must be overwritten at the edge; the module does not mint or verify tokens.

| Header | Meaning |
| --- | --- |
| `x-tenant-id` | Tenant/organization identifier. All repositories are partitioned by this value. |
| `x-actor-id` | Authenticated actor identifier. Used for assignment, review ownership, and audit metadata. |
| `x-actor-roles` | Comma-separated roles. Unknown roles grant nothing; missing headers are denied. |

Authorization is deny by default. A request without a complete actor context, with no recognized role, or with a role not explicitly listed for the endpoint returns `403 AUTH_INSUFFICIENT_PERMISSIONS`. Cross-tenant identifiers return `404 RES_NOT_FOUND` rather than revealing existence.

Roles: `applicant`, `reviewer`, `senior-reviewer`, `review-coordinator`, `review-admin`, `auditor`.

## Endpoints

All routes are under `/proposal-review`. Swagger metadata is generated from the controller decorators and appears under `api/docs`.

| Method | Path | Allowed roles | Purpose |
| --- | --- | --- | --- |
| POST | `/proposals` | `applicant` | Register a proposal and its private applicant payload. The response contains only `id` and `title`. |
| POST | `/rubrics` | `review-admin`, `review-coordinator` | Create a rubric with weighted criteria. |
| GET | `/rubrics/:rubricId` | reviewers, admins | Read rubric metadata. |
| POST | `/queues` | `review-admin`, `review-coordinator` | Create an open or blinded queue bound to a rubric. |
| GET | `/queues` | reviewers, admins | List queues in the actor tenant. |
| POST | `/queues/:queueId/assignments` | `review-admin`, `review-coordinator` | Assign a role-eligible reviewer to a proposal. |
| GET | `/queues/:queueId/proposals` | reviewers, admins | Reviewer-facing proposal cards, sanitized for blinded queues. |
| POST | `/revision-cycles` | `review-admin`, `review-coordinator` | Open an explicit revision cycle that permits a second review. |
| POST | `/reviews` | `reviewer`, `senior-reviewer` | Record one independent scored review per proposal and cycle. |
| GET | `/reviews` | reviewers, admins | List review metadata visible to the actor. |
| GET | `/audit` | `review-admin`, `review-coordinator`, `auditor` | List metadata-only audit entries for the tenant. |

## Validation and domain rules

DTOs are validated with `class-validator` both by the global/controller `ValidationPipe` and again in the service, so direct service calls cannot bypass validation. Unknown body fields are rejected. Errors use the shared `ErrorCode` vocabulary via `DomainException` subclasses.

- Rubric criteria must be non-empty, have unique keys, and have weights summing to 100 (`VAL_RUBRIC_WEIGHTS_INVALID`).
- A queue declares `allowedReviewerRoles`; assignment is rejected unless the target reviewer's roles intersect that set (`AUTH_INSUFFICIENT_PERMISSIONS`).
- Review scores must cover every rubric criterion exactly once and stay within each criterion's maximum (`VAL_OUT_OF_RANGE`, `VAL_INVALID_INPUT`). The stored `weightedScore` is a 0-100 value.
- A reviewer may submit only one review per proposal for the initial cycle (`BIZ_REVIEW_ALREADY_EXISTS`). A second review requires an explicit, open revision cycle created by an admin and referenced by `revisionCycleId`.
- The proposal applicant cannot review their own proposal (`BIZ_SEPARATION_OF_DUTIES`). A reviewer must be assigned to the proposal in the queue before submitting.
- Rubric and queue reads, assignments, reviews, and revision cycles are resolved inside the actor tenant only.

## Idempotency and concurrency

Every mutation requires an `idempotencyKey` matching `^[A-Za-z0-9._-]{8,128}$`. Keys are stored per tenant, with a SHA-256 fingerprint of the operation plus request payload (the key itself is excluded). The payload is never stored in plaintext.

- Replaying the same key, operation, actor, and payload returns the original response with no duplicate write or audit entry.
- Reusing a key with a different payload, operation, or actor returns `409 BIZ_IDEMPOTENCY_KEY_REUSED`.
- A per-tenant/per-key promise lock serializes retries, and a second lock keyed by proposal/reviewer/revision cycle serializes competing first-review submissions with different keys.

## Blinded mode behavior

Queues declare `reviewMode: blinded | open`. In `blinded` mode, reviewer-facing proposal cards contain only `id`, `title`, and `summary`; the fields `applicantName`, `applicantEmail`, and `organizationIdentifier` are omitted entirely. Those values are also replaced with `[redacted]` when they appear inside `title` or `summary` text. In `open` mode the identity fields are returned as declared. Review responses never include `privateNotes`, regardless of mode.

## Audit behavior

Audit entries record only `id`, `tenantId`, `actorId`, `action`, `entityType`, `entityId`, `idempotencyKey`, and `at`. No request bodies, applicant details, private notes, or scores are written to the audit trail. Audit listings are tenant-scoped and restricted to audit/admin roles. Idempotency records store hashes rather than payloads.

## CAPSTONE cross-repo style references

- Tenant partitioning and deny-by-default authorization follow the organization-scoped guard pattern in `src/common/guards/organization-roles.guard.ts` and `src/scholarship-reviewer-dashboard/scholarship-reviewer-dashboard.controller.ts` (shared CAPSTONE convention across contributor worktrees).
- Idempotency key reuse conflicts and replay semantics follow `src/idempotency/idempotency.service.ts` and the `BIZ_IDEMPOTENCY_KEY_REUSED` shared error code.
- Normalized review scores and rubric weight validation follow `src/scholarships/services/scholarship-review.service.ts` and `src/scholarships/dto/scholarship-review.dto.ts`.
- Blind identity stripping follows `src/scholarship-reviewer-dashboard/scholarship-reviewer-dashboard.service.ts` and its reviewer dashboard DTOs.
- Swagger decorators, shared `DomainException` error codes, and focused unit/integration specs follow the conventions used by the scholarship and mentorship feature modules in this repository.

## Testing

```sh
npx jest --runTestsByPath \
  src/proposal-review/proposal-review.dto.spec.ts \
  src/proposal-review/proposal-review.service.spec.ts \
  src/proposal-review/proposal-review.integration.spec.ts \
  --runInBand
```
