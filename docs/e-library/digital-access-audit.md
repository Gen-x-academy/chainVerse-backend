# Digital Access Audit Events

Security-relevant **grant** and **denial** events around digital download /
streaming are recorded into the append-only `elibrary_audit_logs` collection.
The purpose is accountability for access decisions while explicitly **not**
collecting page-level reading behavior.

## Recorded events

| Event | `AuditAction` | Target | `reason` |
| --- | --- | --- | --- |
| Digital loan checked out | `digital_access_checkout` | `digital_loan` | — |
| Digital loan returned | `digital_access_return` | `digital_loan` | — |
| Digital access revoked | `digital_access_revoke` | `digital_loan` | optional |
| Fulfillment granted (stream/download) | `digital_access_grant` | `digital_rendition` | — |
| Fulfillment denied | `digital_access_denied` | `digital_rendition` | required |

Every event records:

- **patron identifier** (`actorId`) — identifier only, no other patron context,
- resource identifiers — the loan id, edition id, and rendition id,
- **UTC timestamp** (`timestamp`),
- **outcome** encoded by the action, and a **reason** when applicable,
- coarse technical metadata — see the privacy policy below.

## Privacy policy (no page-level surveillance)

Only the following coarse keys are accepted from the technical metadata a
client may provide; everything else is **dropped**:

`ipClass`, `networkType`, `clientPlatform`, `userAgentCategory`, `deviceClass`, `referrerCategory`

Values are stored as strings. Anything that would constitute a reading trail
(`pageNumber`, `readingPosition`, `timeSpentPerPage`, `scrollDepth`, and any
unknown key) is discarded before persistence. No page content is ever stored.

## Querying (librarian / moderator only)

`GET library/digital-access/audit` (searchable history) and
`GET library/digital-access/audit/:auditId` (single entry). Both require
`LIBRARIAN` or `MODERATOR`. Also available under the `v1/library/digital-access/audit` alias.

Query filters:
- `patronId` — patron identifier,
- `loanId`, `editionId`, `renditionId` — resource identifiers,
- `outcome` — `granted` or `denied`,
- `dateFrom` / `dateTo` — ISO-8601 UTC range,
- `page` / `limit` — pagination.

## Integrity

The `elibrary_audit_logs` collection is append-only: model-level middleware
rejects any update or delete operation, so digital access history cannot be
rewritten after the fact.

## Recording in your flow

Use `DigitalAccessAuditService`:

- `recordGrant(ctx)` before fulfilling a stream/download,
- `recordDenial(ctx, reason)` when fulfillment is refused,
- `recordCheckout(ctx)` / `recordReturn(ctx)` / `recordRevoke(ctx, reason?)`
  at the loan lifecycle boundaries.

Any page-level data passed in `ctx.technical` is stripped by the
normalization layer.