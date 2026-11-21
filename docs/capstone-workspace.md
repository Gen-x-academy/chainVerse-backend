# Capstone workspace backend helpers (CAPSTONE-069..072)

This repository now has a pure domain helper module at
`src/capstone/workspace/capstone-workspace.ts` with unit coverage in
`src/capstone/workspace/capstone-workspace.spec.ts`.

## Covered work items

- CAPSTONE-069: project discussion threads (creation, mentions, attachments,
  moderation, resolution lifecycle, retention, stable post ordering).
- CAPSTONE-070: project decisions (statement, context, alternatives, approvers,
  effective dates, evidence references, approvals, rejection, supersession).
- CAPSTONE-071: source-control references (revocable provider connections,
  repository/branch/commit/release/contribution links, signed webhooks).
- CAPSTONE-072: project activity feed (permission-filtered entries with actor,
  type, time, deep link, pagination, read state and retention).

## Dependencies

- Node `crypto` for HMAC-SHA256 webhook verification and constant-time comparison.
- No database driver, HTTP framework or network client is required by the helpers.
- Persistence adapters must provide the existing arrays/records and persist the
  returned copies. Callers own atomic writes and unique indexes.
- A vault or secrets manager must issue `vault:`-prefixed token references.
  Raw provider credentials are rejected.

## Authorization and privacy boundaries

- Every entry point calls `assertWorkspaceAccess`; access is deny-by-default.
- Tenant and project identifiers must match the row being read or mutated.
- Active membership is required; `maintainer` or `owner` is required for thread
  transitions, moderation, decision recording and provider connection changes.
- Private threads and private activity entries are omitted entirely for users
  outside their audience; content is never partially redacted.
- Audit references contain identifiers and state changes only. No body text,
  research content, credential, email address or financial data is copied.
- Source metadata drops sensitive keys and nested objects. Webhook payloads are
  mapped to explicit safe fields only.
- Activity summaries redact `token`, `secret`, `password`, `authorization` and
  API-key assignments. Deep links must be project-relative paths.

## Idempotency and concurrency

- All mutating inputs require an `idempotencyKey`. Replaying the same key returns
  the original record without creating a second side effect.
- Threads, decisions, provider connections, source references and activity
  events also reject duplicate IDs with `CAPSTONE_WORKSPACE_IDEMPOTENCY_CONFLICT`.
- Sequence numbers are allocated monotonically from the supplied collection.
  Persistence must enforce matching unique `(tenantId, projectId, sequence)`
  indexes and retry on duplicate-key conflicts.
- Duplicate approvals and read receipts are no-ops.

## Stable errors

All failures throw a stable machine-readable code prefixed with
`CAPSTONE_`. The main codes are:

- `CAPSTONE_WORKSPACE_TENANT_FORBIDDEN`
- `CAPSTONE_WORKSPACE_MEMBER_FORBIDDEN`
- `CAPSTONE_WORKSPACE_ROLE_FORBIDDEN`
- `CAPSTONE_WORKSPACE_NOT_FOUND`
- `CAPSTONE_WORKSPACE_INVALID_INPUT`
- `CAPSTONE_WORKSPACE_STALE_TRANSITION`
- `CAPSTONE_WORKSPACE_IDEMPOTENCY_CONFLICT`
- `CAPSTONE_WEBHOOK_SIGNATURE_INVALID`
- `CAPSTONE_WEBHOOK_REPLAY`
- `CAPSTONE_PROVIDER_CONNECTION_REVOKED`

## API and OpenAPI contract

This change adds domain helpers, not HTTP controllers. The returned record types
are the contract for controller/DTO wiring in a follow-up web layer:

- `CreateDiscussionThreadInput`, `AppendDiscussionPostInput`
- `RecordDecisionInput`
- `ConnectProviderInput`, `SourceReferenceInput`, `ProviderWebhookEvent`
- `BuildActivityEventInput`, activity page `{ entries, nextCursor, hasMore }`

When controllers are added, expose them under
`/projects/{projectId}/workspace/...` and register the corresponding Swagger
schemas. Do not expose raw provider payloads or private thread bodies in those
schemas.

## Rollout

1. Deploy the helper module with indexes on `(tenantId, projectId, sequence)` for
   posts and activity events, and unique indexes on idempotency keys and IDs.
2. Wire read endpoints behind the existing JWT and tenant guards first.
3. Enable write endpoints per project with feature flags; start with discussion
   threads and decisions.
4. Enable provider connections only after the vault reference is available.
5. Enable webhook ingestion only after the shared secret and replay tolerance
   are configured.

## Rollback

- Helpers are additive and stateless; remove the module from imports to disable.
- To stop writes, remove the feature flags or route registrations. Persisted
  records remain readable.
- Revoking provider connections immediately blocks all source-link writes and
  webhook mapping for that connection.
- Retention sweeps only remove records past their configured retention window;
  no cascade deletes are performed by the helpers.

## Corresponding work in other repositories

- Frontend/web: render discussion threads, decision records, source links and
  the activity feed from the documented record shapes; never log private bodies.
- Infrastructure: provide vault references, webhook secrets, retention jobs and
  the unique indexes listed above.
- Mobile: consume the same pagination contract (`before`, `limit`, `nextCursor`)
  and respect private-entry omission.
