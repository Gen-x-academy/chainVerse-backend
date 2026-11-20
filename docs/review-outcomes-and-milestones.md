# Review Outcomes and Milestones Operations

Backend implementation of the shared CAPSTONE-077 through CAPSTONE-080 work items in the Review track. The module is self-contained under `src/review-outcomes/` and uses tenant-keyed in-memory repositories, so it needs no external database.

## Endpoints

All routes are mounted under `/api/v1/review-outcomes` and require a bearer token whose claims include `sub`, `tenantId`, and `roles`.

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| POST | `/proposals` | submitter, admin | Register a proposal version and its review criteria |
| POST | `/proposals/:proposalId/reviews` | reviewer, admin | Submit scores for the current proposal version |
| POST | `/proposals/:proposalId/outcomes` | coordinator, reviewer, admin | Aggregate reviews into an explainable outcome |
| POST | `/proposals/:proposalId/revision-requests` | reviewer, coordinator, admin | Request revisions tied to an exact version and deadline |
| POST | `/proposals/:proposalId/revision-requests/:revisionRequestId/responses` | submitter, admin | Submit the required next version |
| POST | `/milestones/:milestoneId/deliverables` | submitter, admin | Submit an immutable deliverable version |
| POST | `/milestones/:milestoneId/deliverables/:deliverableId/reviews` | reviewer, admin | Accept, request changes on, or reject a deliverable |
| GET | `/audit` | coordinator, admin | Read tenant audit metadata |

Every endpoint is documented in Swagger with `@ApiTags`, `@ApiOperation`, and `@ApiResponse`.

## Domain rules

- Reviews count only when their `proposalVersion` matches the current proposal version; stale scores are excluded and never mutated.
- Aggregation supports `none` and `trim_outliers` calibration, `abstain` and `zero_fill` missing-review handling, an explicit quorum, and `escalate_on_exact_threshold` tie treatment. Missing reviews are reported in the result instead of being silently ignored.
- `strictQuorum: true` rejects an aggregation with `QUORUM_NOT_MET`; otherwise an abstain policy yields `insufficient_reviews` and a zero-fill policy produces an explicit adjusted score.
- Revision requests bind to a proposal version and an ISO-8601 deadline. A pending request blocks a second request for the same version. Responses must create exactly `currentVersion + 1`.
- Deliverable versions are immutable. The submitter cannot be a designated reviewer. Only the current version may be reviewed, and a reviewer may decide once per version.
- A deliverable is accepted when the accept count reaches `requiredApprovals`; `request_changes` and `reject` are terminal for that version.
- Finalized proposals and deliverables reject further reviews with stable error codes such as `PROPOSAL_FINALIZED` and `DELIVERABLE_FINALIZED`.

## Authorization and tenant isolation

`ReviewOutcomesAccessGuard` denies requests without authenticated `sub`, `tenantId`, and `roles` claims. The service applies a deny-by-default operation-to-role map; an unknown role never matches an allowlist. All repositories are keyed by `tenantId`, and cross-tenant identifiers resolve to `REVIEW_OUTCOMES_NOT_FOUND` so entity existence is not leaked.

## Validation

All request bodies are class-validator DTOs. The global `ValidationPipe` applies `whitelist`, `forbidNonWhitelisted`, and `transform`. Scores are constrained to `0..100`, quorum to at least `1`, approvals to `1..10`, deadlines to ISO-8601, and all identifier and text fields have length bounds. Service-level checks enforce cross-field rules such as criteria/rubric matching and version continuity.

## Idempotency and concurrency

Every mutating request requires `idempotencyKey`. The stored key is scoped to tenant, actor, and operation. A retry returns the original result with `replayed: true`; reuse of the same key with a different body returns `IDEMPOTENCY_KEY_REUSE`. A per-tenant mutex serializes check-then-write sections so concurrent retries cannot create duplicate proposals, reviews, revision requests, versions, or decisions.

## Audit and privacy

Audit entries contain only `tenantId`, `actorId`, `action`, `entityId`, `timestamp`, and scalar metadata such as version numbers, counts, policy names, and outcomes. Proposal payloads, reviewer comments, revision instructions, deliverable references, and rationales are never returned by response mappers, stored in idempotency results, written to audit entries, or logged.

## Dependencies and operations

- Depends on the platform JWT authentication layer and the global validation pipe. No database, queue, or external integration is required.
- Observability is provided through the tenant audit endpoint; downstream notification integrations should consume audit metadata rather than private content.
- Rollout: enable `ReviewOutcomesModule` behind the existing API gateway and monitor `REVIEW_OUTCOMES_*` error codes. Rollback: remove the module import; in-memory state is ephemeral and does not require a data migration.

## CAPSTONE cross-repository references

- CAPSTONE-077: fair review aggregation — pair with the review-results UI work in `chainVerse-frontend` and `chainVerse-web`.
- CAPSTONE-078: proposal revision requests — pair with the revision timeline work in `chainVerse-frontend` and documentation in `chainVerse-docs`.
- CAPSTONE-079: milestone deliverable submission — pair with upload/link entry work in `chainVerse-web`.
- CAPSTONE-080: deliverable review and acceptance — pair with rubric and decision screens in `chainVerse-frontend`.
