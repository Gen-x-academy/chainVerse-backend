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
