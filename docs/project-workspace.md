# Project workspace: collaboration, notes, and resource library

This document covers the backend delivery for CAPSTONE-065, CAPSTONE-066, CAPSTONE-067, and CAPSTONE-068. The implementation lives in one module, `src/project-workspace/`, and is wired into `src/app.module.ts`.

## API surface

All routes are protected by `JwtAuthGuard` and documented with Swagger tags `Project Workspace`, `Project Notes`, `Private Researcher Notes`, and `Project Resource Library`. The authenticated subject (`sub`) is always the actor; callers cannot supply another actor.

### Workspace

- `POST /project-workspaces` — create a tenant-scoped workspace with a title, key, optional objectives, and optional `idempotencyKey`.
- `GET /project-workspaces?tenantId=...` — list workspaces where the caller is a member.
- `GET /project-workspaces/:id` — get workspace details and next actions.
- `GET /project-workspaces/:id/overview` — aggregated home with counts and recent activity.
- `PATCH /project-workspaces/:id` — update with `expectedVersion` optimistic locking.
- `POST /project-workspaces/:id/status` — advance the declared lifecycle state.
- `POST /project-workspaces/:id/members` — add a member with an explicit role.

### Project pause and resume (CAPSTONE-053)

- `POST /project-workspaces/:id/pause-requests` — request a pause with a required private reason, expiry, optional funding impact (`none` or `review_required`), `expectedVersion`, and required `idempotencyKey`.
- `GET /project-workspaces/:id/pause-requests/:pauseId` — read a pause reason and decision reason as a workspace owner.
- `POST /project-workspaces/:id/pause-requests/:pauseId/decision` — approve or reject as a different workspace owner. Rejection requires a private decision reason.
- `POST /project-workspaces/:id/resume` — resume an approved pause with `expectedVersion` and required `idempotencyKey`. The expiry worker also resumes active pauses.

Only an active project can be paused. Every request needs approval from a second owner; self-approval is rejected with `BIZ_WORKSPACE_PAUSE_SELF_APPROVAL`. Expiry must be in the future and at most 90 days away. Expired pending requests are closed without changing project status. Expired active pauses are resumed by a one-minute scheduled job. The generic status endpoint cannot enter or leave `on_hold`, so it cannot bypass this workflow.

On resume, the workspace deadline and all objective/milestone due dates are shifted by the actual elapsed pause duration. A request defaults funding impact to `review_required`; approval and resumption emit metadata-only `project-workspace.pause.approved` and `project-workspace.pause.resumed` events with stable event ids. These events signal a funding review but do not alter reservations, escrows, or transfers. Any downstream event consumer must deduplicate by `eventId`.

While `on_hold`, workspace, member, note, private-note, and resource mutations are rejected; reads remain available. Pause reasons and decision reasons are AES-256-GCM encrypted in the tenant-scoped workspace document using `PROJECT_NOTES_ENCRYPTION_KEY` and its key id. Without a valid key, pause requests and reason reads fail closed. Workspace views expose `hasReason` / `hasDecisionReason` flags rather than text; only workspace owners can read the decrypted detail. Neither audit entries, activity events, logs, nor funding events contain reasons. Request, decision, and resume mutations use optimistic versions and payload fingerprints; a same-key/same-payload retry returns the saved state, while a changed payload returns `BIZ_IDEMPOTENCY_KEY_REUSED`.

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
- Workspace and note updates require `expectedVersion`. Stale writes return `BIZ_WORKSPACE_STALE_VERSION` (or `BIZ_WORKSPACE_NOTE_REVISION_CONFLICT`) instead of overwriting newer data.
- Write DTOs accept `idempotencyKey`; a replay returns the original resource instead of creating a duplicate. Unique indexes back this behavior.
- Lifecycle transitions are centralized in `support/workspace-rules.ts`; invalid transitions return `BIZ_WORKSPACE_INVALID_TRANSITION`.
- Audit entries use the workspace audit actions added in `src/common/audit/audit-action.enum.ts`, and domain failures use the `RES_WORKSPACE_*`, `BIZ_WORKSPACE_*`, and `VAL_WORKSPACE_*` codes in `src/common/errors/error-codes.enum.ts`.
- `workspace.activity.recorded` events are consumed asynchronously by `WorkspaceActivityService`; event consumers never receive note plaintext.

## Testing

- Unit specs: `src/project-workspace/support/*.spec.ts` and `src/project-workspace/services/*.spec.ts`.
- Integration spec: `src/project-workspace/project-workspace.integration.spec.ts` uses `mongodb-memory-server` to verify real indexes, idempotent replay, tenant/role denials, version conflicts, private-note encryption at rest, and resource visibility.
- Run with `npx jest --runInBand project-workspace`.

Pause-specific unit coverage is in `src/project-workspace/services/project-workspace-pause.spec.ts`; the Mongo integration test also races duplicate approvals and checks idempotent replay.

## CAPSTONE-053 dependencies, privacy and operations

- **Dependencies:** existing `JwtAuthGuard`, explicit workspace-owner membership, global DTO validation, MongoDB, the existing Nest schedule module, audit service, workspace event bus, and a valid `PROJECT_NOTES_ENCRYPTION_KEY`. No separate deadline database or on-chain call is made.
- **Privacy boundary:** pause and decision reasons are private workspace content. Keep them out of telemetry, event payloads, UI analytics, and audit metadata. The event carries only tenant/project/pause ids, dates, outcome, and a funding-impact enum.
- **Funding integration:** consumers should treat `review_required` as a request to review funding policy, not as proof that funds were frozen. Do not release or reserve funds from this event alone; use a tenant-scoped, idempotent funding decision keyed by `eventId`. Events use the existing in-process event bus; external notification or funding side effects require a durable outbox/bridge and consumer deduplication before production reliance.
- **Rollout:** additive nullable/defaulted Mongo fields require no backfill. Deploy the API and expiry worker together, then expose the endpoints to workspace owners. Monitor the `project-workspace-pause-expiry` job logs and the `project_workspace.pause_*` audit actions; investigate repeated expiry failures before relying on automatic resume.
- **Rollback:** first resolve pending/active pauses through the API and verify there are no `on_hold` workspaces. Keep the new worker enabled until active pauses are closed; rolling back application code does not erase pause history and can strand an `on_hold` workspace. No funding ledger writes need compensation.
- **Other repositories:** the frontend implementation is [Gen-x-academy/chainVerse-frontend#1479](https://github.com/Gen-x-academy/chainVerse-frontend/issues/1479) (CAPSTONE-053, closed); revalidate its current API contract before wiring. No on-chain CAPSTONE-053 work item was found during this implementation. Pause state and reasons remain backend-only; the adjacent on-chain completion work is [Gen-x-academy/chainVerse-onchain#1402](https://github.com/Gen-x-academy/chainVerse-onchain/issues/1402) (CAPSTONE-054) and must not be used to infer pause behavior.
