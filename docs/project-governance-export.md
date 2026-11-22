# Project Governance Export (CAPSTONE-056)

Generates a participant-safe snapshot of a project's accepted terms, amendments, approvals,
membership, milestone summary and financial summary. Additive, in-memory and tenant-keyed (same
model as `project-milestones`); no migration. Routes live under
`/api/v1/governance-export/tenants/{tenantId}`.

## API

| Method | Route | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/projects` | admin, moderator (create); project owner (replace) | Register a project membership stub |
| POST | `/projects/{projectId}/records` | project owner, admin, moderator | Append a terms-acceptance, amendment or approval record |
| POST | `/projects/{projectId}/exports` | any project member, admin, moderator | Generate an export |
| GET | `/exports/{exportId}` | requester, admin, moderator | Download the export |
| POST | `/exports/{exportId}/revocations` | requester, admin, moderator | Revoke and discard content |
| GET | `/audit` | admin, moderator | Audit metadata |

Every mutation requires an `idempotencyKey` (`^[A-Za-z0-9._-]{8,128}$`). Swagger documents DTOs and
error responses at `/api/docs`.

## Rules and lifecycle

- **Ledger:** append-only. An `amendment` must target accepted `terms_acceptance`; an `approval`
  must target terms or an amendment (`BIZ_GOVERNANCE_TARGET_MISSING`). `(project, kind, reference)`
  is unique (`BIZ_GOVERNANCE_RECORD_DUPLICATE`).
- **Export:** `ready → revoked`. Exports expire after 24 hours; an expired download returns
  `BIZ_GOVERNANCE_EXPORT_EXPIRED`. Revoking twice returns
  `BIZ_GOVERNANCE_EXPORT_INVALID_TRANSITION`; revoking an expired export returns
  `BIZ_GOVERNANCE_EXPORT_EXPIRED`. A requester may hold at most 5 active exports
  (`BIZ_GOVERNANCE_EXPORT_LIMIT`).
- **Partial exports:** the milestone and financial sections come from optional sources. A source that
  is missing, throws, or takes over 5 s makes that section
  `{available:false, reason}` and the export `partial: true`; the export still succeeds, and the
  failure is audited as `export.source`.
- **Integrity:** each export carries a SHA-256 `contentDigest` over its canonical content.

## Concurrency and idempotency

State-changing work is serialised per tenant, so the duplicate and limit checks are atomic. Same key
and payload replays the stored response; same key with a different payload returns
`BIZ_IDEMPOTENCY_KEY_REUSED` (409). Idempotency keys are scoped to tenant, actor and operation
(including the project or export id).

## Privacy boundaries

- Exports never contain user ids. Recorders appear as a project role or `platform`, with a `byYou`
  marker; membership is counts per role plus the viewer's own role.
- Ledger entries hold opaque references and a short `label` (≤120 chars) that is shown verbatim to
  every participant, so it must be non-sensitive. No free-text reasons or notes are stored.
- Milestone data is reduced to counts by status and the next due date; titles, reviewers and
  deliverables never enter the export. Financials are aggregate minor units only.
- Only the requester or a platform admin can read an export. Anyone else gets
  `RES_GOVERNANCE_EXPORT_NOT_FOUND`, so existence is not disclosed. Revocation clears the content.
- Audit entries are metadata only (actor, roles, action, resource id, outcome, hashes), including
  denied and failed attempts. Content and labels are never logged.
- The JWT carries no tenant claim, so the path `tenantId` is the tenant boundary (repo-wide
  limitation, same as `project-milestones`).

## Dependencies

- **Milestones:** wired to CAPSTONE-060 (`ProjectMilestonesService`) via `MilestoneSummarySource`,
  called as the requester so its authorization still applies. The project must also be registered
  there, otherwise that section is `source_failed`.
- **Financials:** `GOVERNANCE_FINANCE_SOURCE` is **not wired**. Provide an adapter over
  `ProjectFundingService` that returns aggregate minor units; until then that section reports
  `source_not_configured` and exports are `partial`.
- **Terms, amendments, approvals and membership** are recorded in this module's own ledger and
  project stub. No existing module owns them, so nothing is read from elsewhere yet.

## Rollout and rollback

Additive: the module is registered in `AppModule`. Register projects and record governance entries
from the owning workflow, then enable exports in the client behind a flag. Roll back by hiding the
export entry point; the module can stay deployed. Data is in-memory, so a restart clears the ledger,
project stubs and exports until a persistent repository replaces
`ProjectGovernanceExportRepository`.

## Cross-repository work

CAPSTONE-056 also has frontend (export request and download UI), contracts (export schema and
digest verification) and finance/governance counterparts in their repositories. Link them in the
PR description.
