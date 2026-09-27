# Scholarship catalog search and filters

Closes #1175.

`GET scholarships/programs` previously accepted only `organizationId`, `status`,
and pagination. Discovery meant paging through everything and reading each
program. It now supports text search, award range, currency, deadline window,
funding type and network.

## Filters

All filters are optional and URL-backed. Every one narrows the **same** query
that produces `total`, so a client can render "N results" and a pager without a
second request — a filter never changes what `total` counts.

| Parameter | Type | Effect |
| --- | --- | --- |
| `search` | string | Case-insensitive match on `title` and `description` |
| `status` | enum | Exact lifecycle status |
| `minAwardValue` / `maxAwardValue` | number | Inclusive award range |
| `awardCurrency` | string | ISO 4217 code, case-insensitive |
| `deadlineBefore` / `deadlineAfter` | ISO 8601 | Inclusive deadline window |
| `fundingType` | enum | `horizon` \| `manual` \| `deposit` |
| `network` | enum | `testnet` \| `public` |
| `includeClosed` | boolean | Include `CLOSED` / `ARCHIVED` programs |

`page` and `limit` are inherited from `OrgScopedQueryDto` (1–100).

### Closed and archived programs are excluded by default

The catalog is a discovery surface for things a student can still apply to, so
the default filter is `status: { $in: ['published'] }`. Staff pass
`includeClosed=true` for audits and reconciliation.

This is a behaviour change worth calling out: a client that previously listed
all programs in an organization will now see only published ones unless it opts
in. That is the intent — a closed program in a student's catalog is a dead end.

## Why the filters read a denormalized projection

Award value, currency and deadline live on `ProgramTermsVersion`, not on
`ScholarshipProgram`. Filtering on them would otherwise require an aggregation
with a `$lookup` on every search request, and the `$lookup` would have to be
repeated for the count query.

Instead, `ScholarshipProgram` carries a denormalized projection of the
**currently published** terms:

| Field | Source |
| --- | --- |
| `awardValue` | `ProgramTermsVersion.awardValue` |
| `awardCurrency` | `ProgramTermsVersion.awardCurrency` |
| `applicationDeadline` | first present of `closesAt`, `applicationDeadline`, `dueAt`, `deadline` |
| `fundingType` | how the program is funded |
| `network` | Stellar network the program pays out on |

`publishTerms` writes these whenever a revision becomes current, so they always
describe the published terms. They are **never** written by a client and never
read as the source of truth — the terms revision remains authoritative and
these are a projection of it.

This is the same pattern as the matching feature's program haystack: a read
model that carries the fields it filters on, kept in sync at the write that
changes them.

### Indexes

```ts
ScholarshipProgramSchema.index({ organizationId: 1, status: 1, awardValue: -1 });
ScholarshipProgramSchema.index({ organizationId: 1, applicationDeadline: 1 });
```

The first serves the award-range filter; the second serves "closing soon"
queries. Both are compound with `organizationId` first, so they cannot be used
to scan across tenants.

## Search text is escaped

`search` is matched with a case-insensitive regex, so the input is escaped before
it becomes a pattern:

```ts
const needle = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

Without this, a query containing `(` or `)` would be interpreted as a regex and
throw a `SyntaxError` at request time — a trivially reachable 500.

## API

```
GET /scholarships/programs?organizationId=…&search=stellar&minAwardValue=1000&awardCurrency=USD&deadlineBefore=2026-12-31&fundingType=horizon&network=public&page=1&limit=20
```

Response is the standard pagination envelope:

```json
{
  "data": [
    {
      "_id": "…",
      "organizationId": "…",
      "title": "Stellar smart contract scholarship",
      "description": "…",
      "status": "published",
      "awardValue": 5000,
      "awardCurrency": "USD",
      "applicationDeadline": "2026-12-01T00:00:00.000Z",
      "fundingType": "horizon",
      "network": "testnet"
    }
  ],
  "total": 137,
  "page": 1,
  "limit": 20,
  "totalPages": 7
}
```

## Authorization

Unchanged: `JwtAuthGuard` + `OrganizationRolesGuard`, with `organizationId`
taken from the query string and verified by `@OrgScope`. OWNER, ADMIN,
INSTRUCTOR and MEMBER may list. The tenant scope is enforced by the
`organizationId` filter itself, so a valid membership in organization A can
never expose organization B's programs.

## Migration

**New programs** get the projection fields from the schema defaults
(`awardValue: 0`, `awardCurrency: null`, `applicationDeadline: null`,
`fundingType: 'manual'`, `network: 'testnet'`).

**Existing programs** need a one-off backfill, because the fields did not exist
before this change. Until the backfill runs, every program filters as if it had
no published terms — which is safe (it excludes them from award/deadline
filters) but wrong.

```bash
npx ts-node scripts/backfill-scholarship-program-search.ts
```

The script is idempotent: it only writes fields that are missing or stale, and
it can be re-run after any data change.

## Operational impact

- A search is a single indexed query. The candidate set is bounded by
  `organizationId`, which is always present, so a broad `search` cannot scan the
  whole collection.
- `deadlineBefore` / `deadlineAfter` compare against a `Date`, so clients must
  send ISO 8601. A malformed date is rejected by `@IsISO8601()` with a 400.
- The projection adds five fields to every program document. The write happens
  once per terms publication, not per request, so the cost is negligible.
- `publishTerms` now writes six fields instead of two. If a program has many
  terms revisions, publishing is still a single `updateOne` on the program
  document.

## Tests

`src/scholarships/__tests__/scholarship-programs.service.spec.ts` covers:

- the published-only default and the `includeClosed` opt-in;
- each filter in isolation, asserting the exact Mongo filter produced;
- regex escaping for `search`;
- that combining filters narrows one query (so `total` stays honest);
- that `publishTerms` keeps the projection in step — including storing `null`
  for a revision that publishes no deadline, rather than guessing.
