# Finance operations dashboard

Closes #1174.

One endpoint that answers the operator's morning question — *where is the money,
and what needs a decision?* — across funding, liabilities, due payments,
failures, reconciliation, refunds and recoveries. Previously that meant opening
six listings and joining them by hand.

## Endpoint

```
GET /organizations/:organizationId/scholarship-finance/dashboard
```

Authorization: `JwtAuthGuard` + `FinanceAccessGuard` with
`FinancePermission.VIEW` in `:organizationId`. The tenant scope is enforced by
every query filtering on `organizationId`, so a valid membership in organization
A can never expose organization B's finances.

## Sections

| Section | Contents |
| --- | --- |
| `funding` | Open funding rounds, credited deposits, per-asset credited totals |
| `liabilities` | Open recovery claims and refunds awaiting a decision, with the amount at stake |
| `duePayments` | Payouts that are pending or submitted but not yet successful |
| `failures` | Failed payouts, grouped by diagnosis code |
| `reconciliation` | Reconciliation runs and ledger balances |
| `refunds` | Refunds by status, with the amount at stake |
| `recoveries` | Recovery claims, collections, and outstanding exposure |

`liabilities.awaitingDecision` is the part that needs a human: it counts the
items an APPROVER can act on right now and sums the money involved.

## Staleness

Every section reports `asOf` (the newest timestamp it actually read) and
`stale` (whether that is older than the caller's threshold). The top-level
response reports the **oldest** section `asOf`, because the newest section says
nothing about the stalest one.

Staleness is **per section**, not global. Reconciliation runs hourly; deposits
are written on demand. A single global flag would be permanently true for one
and permanently false for the other.

An empty section is stale. An empty section is not a fresh section — it is an
absent one, and an operator shown a green dashboard over an empty collection
will act on a number that does not exist.

Tune with `?staleAfterMs=` (default 900 000, minimum 1 000).

## Shareable filters

Filters are URL-backed, and a `view` parameter makes a dashboard reproducible:

```
GET …/dashboard?asset=XLM&status=open&from=2026-01-01&limit=50
GET …/dashboard?view=eyJhc3NldCI6IlhBTCIsInN0YXR1cyI6Im9wZW4ifQ==
```

`view` is a base64-encoded JSON object of the same fields. When present it
**overrides** the individual parameters, so a shared link reproduces an exact
dashboard rather than relying on the recipient's defaults.

A malformed `view` is a `400`, not a silently ignored parameter — a link that
does not decode should fail loudly instead of rendering a different dashboard
than the one that was shared.

`limit` is clamped to 1–100 on decode, so a shared link cannot request an
unbounded result set.

## High-risk actions

```
POST /organizations/:organizationId/scholarship-finance/dashboard/actions
```

Requires `FinancePermission.APPROVE` **and** an `X-Confirm` header that exactly
matches the requested action. Both checks are needed because either alone is
bypassable:

| Check | Defeats |
| --- | --- |
| `X-Confirm` header | Prefetched links, crawlers, stray clicks — none can set a header |
| `APPROVE` privilege | A confirmed request from someone who should not be approving |

Supported actions:

| Action | Effect |
| --- | --- |
| `approve_refund` | Approve a requested refund |
| `approve_recovery` | Approve a recovery claim |
| `write_off_recovery` | Write off an uncollectible claim |

`credit_deposit` and `record_collection` are **deliberately not exposed here**.
They already have their own endpoints and guards, and re-exposing them would
create a second, weaker path to the same money movement.

The action list is server-side only — it is never returned by the GET endpoint,
so a client cannot discover a mutation route by reading a dashboard.

## Design notes

### It is a read model

`FinanceDashboardService` reads the finance aggregates directly and never
writes. It does not call the write services for its listings: a dashboard that
shares a code path with a mutation can be broken by a mutation. The one
exception is `execute`, which delegates to `RefundService` / `RecoveryService`
for the three approved actions.

### Sections fail independently

Each section is fetched with `Promise.all`, and a section that could not be read
reports `error` and `stale: true` rather than failing the whole request. An
operator with a partial dashboard can still act on the parts they can see.

### Amounts are in minor units

All amounts are integer minor units (cents), matching the finance schemas. A
dashboard that formatted them would hide rounding differences that matter when
reconciling.

## Migration

None. The dashboard is a new read endpoint over existing collections.

## Operational impact

- The endpoint issues up to nine queries per request, all indexed and all
  bounded by `organizationId` plus a `limit`. The heaviest is the deposit
  aggregate, which groups by `assetKey` over one organization's credited
  deposits.
- Because it is a read model, it can be cached and invalidated independently of
  the write paths. If it ever becomes a bottleneck, the seam is the section
  table above — each section can be cached on its own schedule.
- `staleAfterMs` exists because the right threshold is an operational decision
  baked into the dashboard's consumers, not a property of the data.

## Privacy

The dashboard returns organization finance data. It is guarded by
`FinanceAccessGuard`, which resolves the caller's finance role from
`organizationmembers` and rejects non-members with
`AUTH_INSUFFICIENT_PERMISSIONS`. Platform admins (`Role.ADMIN`) hold every
permission across tenants, which is the documented escape hatch for support.

## Tests

`src/scholarship-finance/dashboard/__tests__/finance-dashboard.spec.ts` covers:

- `view` round-tripping and URL-safety;
- that unknown fields are dropped and `limit` is clamped on decode;
- that a malformed `view` yields null (a 400) rather than a partial filter;
- action dispatch, including the two actions that are deliberately rejected;
- the staleness rule, including that an empty section counts as stale and that
  the rule is per section rather than global.
