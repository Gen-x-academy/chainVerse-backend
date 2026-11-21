# Project workspace: collaboration, notes, and resource library

This document covers the backend delivery for CAPSTONE-054, CAPSTONE-065, CAPSTONE-066, CAPSTONE-067, and CAPSTONE-068. The implementation lives in one module, `src/project-workspace/`, and is wired into `src/app.module.ts`.

## API surface

All routes are protected by `JwtAuthGuard` and documented with Swagger tags `Project Workspace`, `Project Notes`, `Private Researcher Notes`, and `Project Resource Library`. The authenticated subject (`sub`) is always the actor; callers cannot supply another actor.

### Workspace

- `POST /project-workspaces` — create a tenant-scoped workspace with a title, key, optional objectives, and optional `idempotencyKey`.
- `GET /project-workspaces?tenantId=...` — list workspaces where the caller is a member.
- `GET /project-workspaces/:id` — get workspace details and next actions.
- `GET /project-workspaces/:id/overview` — aggregated home with counts and recent activity.
- `PATCH /project-workspaces/:id` — update with `expectedVersion` optimistic locking.
- `POST /project-workspaces/:id/status` — advance non-terminal states, or archive an already-completed workspace. Other transitions to `completed` or `archived` require the closure API.
- `POST /project-workspaces/:id/members` — add a member with an explicit role.
- `POST /project-workspaces/:id/closure` — complete or terminate the project with a structured reason/outcome.
- `POST /project-workspaces/:id/closure-consents` — add an affirmative member consent to a pending mutual-termination proposal.

### Project closure (CAPSTONE-054)

The durable `ProjectWorkspace` document stores the terminal status, structured closure reason/outcome, timestamp, actor id, version, and idempotency fingerprint. The API does not accept or return free-text closure explanations. Closure responses expose project id/status/version, closure reason/outcome/timestamp, and, while a mutual termination is pending, the received/required consent counts; consent identities, retry keys, and hashes are never returned.

The lifecycle preserves the existing transition map: successful completion moves an active project to `completed`; all termination outcomes move a draft, active, or on-hold project to `archived`. Successful completion requires every declared objective and milestone to be complete. Existing status routes cannot bypass these rules. Mutations to workspace details, membership, notes, private notes, and resources are denied after closure. During a mutual-termination proposal, writes are paused so the member set requiring consent remains stable.

| Reason | Authorization and rule | Stored outcome |
| ------ | ---------------------- | -------------- |
| `successful_completion` | Workspace owner; project must be active and all objectives/milestones complete | `completed` |
| `mutual_termination` | Any current member may propose; every current member, including the proposer, must affirm | `mutually_terminated` |
| `policy_action` | Authenticated `admin`/`moderator` who is also an owner/editor of the workspace | `terminated_by_policy` |
| `sponsor_withdrawal` | Explicit workspace `sponsor` member | `terminated_by_sponsor` |
| `inactivity` | Daily background sweep after 90 days without activity; active and on-hold projects only | `terminated_for_inactivity` |

Closure and consent mutations require `expectedVersion` and an `idempotencyKey`. MongoDB compare-and-set updates make simultaneous decisions single-winner; a stale version returns `BIZ_WORKSPACE_STALE_VERSION`, a reused key with a changed request returns `BIZ_IDEMPOTENCY_KEY_REUSED`, and duplicate member consent returns `BIZ_WORKSPACE_CONSENT_EXISTS`. Closure state is committed before audit/activity emission; retries return the stored result without replaying those side effects. Closure audit context omits email, IP address, and user agent; audit metadata contains actor/resource ids, role, request id, status, reason, outcome, and counts only.

The inactivity sweep uses both workspace `updatedAt` and the latest metadata-only activity event. The activity consumer refreshes `updatedAt` when it records an event, so resource/note activity is considered without exposing its contents. A sweep failure is logged and rethrown for scheduler observability; closure writes use version/status filters so multiple backend instances cannot close the same project twice.

### Shared notes

- `POST /project-workspaces/:projectId/notes` — create a team-visible Markdown note.
- `GET /project-workspaces/:projectId/notes?includeArchived=true` — list shared notes; private notes are never included.
- `GET /project-workspaces/:projectId/notes/:id` and `/revisions` — read a note and its append-only revision history.
- `PATCH /project-workspaces/:projectId/notes/:id` — versioned update.
- `POST /project-workspaces/:projectId/notes/:id/archive` — archive while preserving revisions.

Markdown is rendered through an allowlist in `support/safe-render.ts`. Scripts, event handlers, `javascript:` links, frames, forms, and embedded remote content are rejected with `VAL_WORKSPACE_UNSAFE_MARKUP` instead of being stored.

### Private researcher notes

- `POST /project-workspaces/:projectId/private-notes` — create an owner-only encrypted note.
- `GET /project-workspaces/:projectId/private-notes` — list only the caller's own private notes.
- `GET /project-workspaces/:projectId/private-notes/:id` — decrypt and read the caller's own note.
- `PATCH /project-workspaces/:projectId/private-notes/:id` — versioned update; re-encrypts atomically.
- `POST /project-workspaces/:projectId/private-notes/:id/archive` — archive the caller's own note.

Title and body are encrypted with AES-256-GCM using a 32-byte base64 key from `PROJECT_NOTES_ENCRYPTION_KEY`. `PROJECT_NOTES_ENCRYPTION_KEY_ID` defaults to `v1` and is stored with the ciphertext for rotation. If the key is absent, private-note endpoints fail closed with `BIZ_WORKSPACE_PRIVATE_NOTES_DISABLED`. Stored records contain only `ciphertext`, `iv`, `authTag`, `keyId`, and `algorithm`. Audit and activity records include identifiers and actions only; never note plaintext. Shared-note list/find responses omit `source` and `idempotencyKey`.

### Resource library

- `POST /project-workspaces/:projectId/resources` — submit a file, dataset, or link with integrity metadata.
- `GET /project-workspaces/:projectId/resources` and `/:id` — read approved resources allowed by access policy.
- `PATCH /project-workspaces/:projectId/resources/:id` — revise a pending or rejected resource with a version lock.
- `POST /project-workspaces/:projectId/resources/:id/approve` — workspace-owner-only approval of a pending resource.
- `POST /project-workspaces/:projectId/resources/:id/reject` — reject a pending resource with a reason.
- `POST /project-workspaces/:projectId/resources/:id/archive` — archive while preserving version history.

Links must use HTTPS. Files and datasets require a 64-character hex SHA-256 checksum. Access policies are `private`, `team`, and `public`; unapproved resources are visible only to the submitter and workspace owners, and private approved resources are visible only to the submitter and owners.

## Cross-cutting rules

- Every nested write first loads the workspace and checks the caller's tenant and role through `WorkspaceAccessService`. Unknown, archived, or non-member access is denied by default.
- The closure API keeps policy actions tenant-scoped by requiring both a recognized platform role and explicit workspace owner/editor membership. Sponsors must be explicitly assigned the `sponsor` workspace role.
- Workspace and note updates require `expectedVersion`. Stale writes return `BIZ_WORKSPACE_STALE_VERSION` (or `BIZ_WORKSPACE_NOTE_REVISION_CONFLICT`) instead of overwriting newer data.
- Write DTOs accept `idempotencyKey`; a replay returns the original resource instead of creating a duplicate. Unique indexes back this behavior.
- Lifecycle transitions are centralized in `support/workspace-rules.ts`; invalid transitions return `BIZ_WORKSPACE_INVALID_TRANSITION`.
- Audit entries use the workspace audit actions added in `src/common/audit/audit-action.enum.ts`, and domain failures use the `RES_WORKSPACE_*`, `BIZ_WORKSPACE_*`, and `VAL_WORKSPACE_*` codes in `src/common/errors/error-codes.enum.ts`.
- `workspace.activity.recorded` events are consumed asynchronously by `WorkspaceActivityService`; event consumers never receive note plaintext. Both activity and workspace timestamps feed the inactivity sweep.

## Dependencies, privacy, and operations

- Dependencies: MongoDB/Mongoose, `ScheduleModule`, existing JWT roles, `WorkspaceAccessService`, `AuditService`, and the metadata-only workspace activity event consumer. No chain transaction or financial transfer is performed by this backend closure.
- Privacy boundary: free-text reasons, proposal contents, research notes, identities beyond the authenticated actor id, and financial/private payloads are not added to closure requests or audit records. Only enumerated reason/outcome codes and consent counts are exposed. The on-chain integration should receive only the bounded status/outcome reference needed by its contract; private content remains off-chain.
- Rollout: additive nullable closure/proposal fields require no backfill. The new `{status, updatedAt}` index is created with the workspace schema (prebuild it if production disables Mongoose auto-indexing). Deploy the API and scheduled worker together. The 90-day sweep is enabled immediately and runs daily at 02:00 in the process timezone; monitor `project-workspace-inactivity-closure` logs and closure audit actions during rollout.
- Rollback: disable/remove `ProjectClosureService` and its routes/worker together. Existing terminal documents remain readable; do not clear their terminal status or closure metadata. To disable only automated inactivity closure, remove the scheduled decorator/worker while keeping manual closure routes.
- Dependency failure: the sweep logs and propagates database errors; the existing audit service follows `AUDIT_LOG_FAIL_CLOSED`. Audit and activity contain metadata only. No user notification or external payment side effect is emitted by this capability.

## CAPSTONE-054 cross-repository work

| Repository | Work item | Contract responsibility |
| ---------- | --------- | ----------------------- |
| Backend | [#1564](https://github.com/Gen-x-academy/chainVerse-backend/issues/1564) | Durable lifecycle state, authorization, consent, idempotency, inactivity processing, audit, and OpenAPI. |
| Frontend | [#1480](https://github.com/Gen-x-academy/chainVerse-frontend/issues/1480) | Closure reason/outcome UX, consent collection, stale-version and authorization handling. This issue is closed; revalidate its implementation against this API contract. |
| On-chain | [#1402](https://github.com/Gen-x-academy/chainVerse-onchain/issues/1402) | Optional privacy-minimized state/attestation integration; never publish private closure explanations or research content. |

## Testing

- Unit specs: `src/project-workspace/support/*.spec.ts` and `src/project-workspace/services/*.spec.ts`.
- Integration spec: `src/project-workspace/project-workspace.integration.spec.ts` uses `mongodb-memory-server` to verify real indexes, closure idempotency and concurrent consent, tenant/role denials, version conflicts, inactivity dependency failures, private-note encryption at rest, and resource visibility.
- Run with `npx jest --runInBand project-workspace`.
