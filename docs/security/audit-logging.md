# Immutable audit logging for privileged actions

Course review, financial-aid decisions, moderation and account administration
now share a single append-only audit trail stored in the `audit_logs`
collection.

Implementation lives in [`src/common/audit`](../../src/common/audit).

## What is recorded

Every entry carries the fields the acceptance criteria call for:

| Field           | Meaning                                                            |
| --------------- | ------------------------------------------------------------------ |
| `action`        | Namespaced verb from `AuditAction`, e.g. `course.reviewed`          |
| `actor`         | `{ id, email, role, ip, userAgent }` of the caller                  |
| `target`        | `{ type, id }` of the object acted on                               |
| `requestId`     | Correlation ID from `X-Request-Id` (set by `RequestIdMiddleware`)   |
| `timestamp`     | When the action happened                                            |
| `recordedAt`    | When the entry was stored (schema timestamp)                        |
| `outcome`       | `success`, `failure` or `denied`                                    |
| `before`        | Redacted state before the mutation (`null` for creations)           |
| `after`         | Redacted state after the mutation (`null` for deletions)            |
| `reason`        | Operator-supplied justification, where the endpoint collects one    |
| `integrityHash` | HMAC-SHA256 over the canonical entry                                |

## Covered actions

| Area                              | Actions                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/admin-course`                | `course.reviewed`, `course.published`, `course.unpublished`, `course.updated`, `course.deleted` |
| `src/admin-financial-aid-management` | `financial_aid.created`, `financial_aid.updated`, `financial_aid.deleted`                |
| `src/admin-auth`                  | `admin_account.created`, `admin_account.updated`, `admin_account.deleted`                    |
| `src/report-abuse`                | `abuse_report.updated`, `abuse_report.deleted`                                               |
| `src/organization`, `src/organization-member` | `organization.*`, `organization_member.*`                                        |
| `src/worker`                      | `file_upload.quarantined`, `file_upload.scanned`, `file_upload.released`, `file_upload.rejected`, `file_upload.deleted` |

Course actions are audited only when performed by an admin. A tutor editing
their own course is ordinary authorship, not a privileged action.

## How immutability is enforced

Three independent layers, so no single bypass is enough:

1. **Query middleware** — `applyAuditImmutability` registers `pre` hooks that
   throw `AuditLogImmutableError` for `updateOne`, `updateMany`, `replaceOne`,
   `findOneAndUpdate`, `findOneAndReplace`, `findOneAndDelete`,
   `findOneAndRemove`, `deleteOne`, `deleteMany`, `remove` and `bulkWrite`.
2. **Document middleware** — `pre('save')` rejects saving a document that is not
   `isNew`, so an entry cannot be loaded, edited and re-saved.
3. **Integrity hash** — `integrityHash` is an HMAC over the canonical
   (key-sorted) entry. Tampering performed outside the application, for example
   a direct `mongosh` write, is detectable with `AuditService.verify(entry)`.

Application-level guards do not stop a database administrator. For a genuinely
tamper-proof trail, pair this with a database role that lacks `update` and
`delete` privileges on `audit_logs`, and ship entries to append-only storage.

## Redaction

Everything written to `before`/`after` passes through `redactMetadata`:

- Values under sensitive keys (`password`, `token`, `secret`, `authorization`,
  `apiKey`, `ssn`, `cardNumber`, `mnemonic`, …) become `[REDACTED]`. Key
  matching is case-insensitive and separator-insensitive, so `card_number`,
  `card-number` and `cardNumber` are all caught.
- Email addresses are masked to `a***@example.com`, so an auditor can correlate
  accounts without the collection becoming a harvestable address list.
- Strings over 512 characters are truncated, arrays capped at 20 entries,
  objects capped at 50 keys, nesting capped at depth 5, and cycles broken.

## Configuration

| Variable                | Default | Purpose                                                       |
| ----------------------- | ------- | ------------------------------------------------------------- |
| `AUDIT_HMAC_SECRET`     | unset   | Dedicated HMAC key. Falls back to `JWT_SECRET` when unset.    |
| `AUDIT_LOG_FAIL_CLOSED` | `false` | When `true`, a failed audit write fails the mutation as well. |

`AUDIT_HMAC_SECRET` is optional so existing deployments keep working, but set it
in production: sharing the key with `JWT_SECRET` means rotating that secret
invalidates the integrity hash of every historical entry. `AuditService` logs a
warning at startup when it is missing in production.

`AUDIT_LOG_FAIL_CLOSED` defaults to `false` so an audit outage cannot fail an
otherwise successful privileged mutation. Set it to `true` where a missing audit
record is worse than a failed operation.

## API behaviour

No request or response shape changes. Audited handlers gain an `@AuditActor()`
parameter, which is resolved server-side from the authenticated principal and
request headers — it is not client-supplied.

## Usage

```ts
// Controller: resolve the actor from the request
@Patch(':id')
update(
  @Param('id') id: string,
  @Body() dto: UpdateDto,
  @AuditActor() audit: AuditContext,
) {
  return this.service.update(id, dto, audit);
}

// Service: record around the mutation
const before = snapshot(existing, AUDIT_FIELDS);
const updated = await this.model.findByIdAndUpdate(id, dto, { new: true });

await this.auditService.record({
  action: AuditAction.ABUSE_REPORT_UPDATED,
  context: audit ?? systemAuditContext(),
  target: { type: 'abuse_report', id },
  before,
  after: snapshot(updated, AUDIT_FIELDS),
});
```

Background jobs and other non-HTTP callers use `systemAuditContext()`.

## Tests

- `src/common/audit/audit.service.spec.ts` — entry shape, redaction, integrity
  hash verification and tamper detection, fail-open/fail-closed
- `src/common/audit/audit-redaction.spec.ts` — redaction rules and limits
- `src/common/audit/audit-context.spec.ts` — actor resolution
- `src/common/audit/schemas/audit-log.schema.spec.ts` — append-only guards
- `src/admin-course/admin-course.audit.spec.ts`,
  `src/admin-auth/admin-auth.service.spec.ts`,
  `src/report-abuse/report-abuse.service.spec.ts` — per-domain wiring
