# Application History Pagination

Closes #1249.

`GET scholarships/applications/me` returned the applicant's entire application
history:

```ts
// before
async listMine(applicantId) {
  return this.applicationModel.find({ applicantId }).sort({ createdAt: -1 }).exec();
}
```

Three problems, all of which get worse as an account ages:

1. **Unbounded read.** The endpoint had no `limit`. A student with a few hundred
   applications forced the server to load every document — including the frozen
   `acceptedTermsSnapshot` and all form answers — into memory on every page load.
   `PaginationService` was already injected into `ScholarshipApplicationsService`
   and simply not used here.
2. **Non-deterministic ordering.** The sort was `{ createdAt: -1 }` alone.
   `createdAt` has millisecond resolution, so any burst of submissions shares a
   timestamp, and MongoDB is free to order tied documents differently on each
   query. Paging a list like that produces **duplicated and skipped rows**: a row
   that moves between page 1 and page 2 is shown twice or not at all.
3. **Undocumented envelope.** Callers had no `total`, so a client could not tell
   "end of list" from "more to come" without fetching until it got an empty page.

## Response shape

The endpoint now returns the standard pagination envelope:

```json
{
  "data": [ { "_id": "…", "programId": "…", "status": "under_review", "…": "…" } ],
  "total": 137,
  "page": 1,
  "limit": 20,
  "totalPages": 7
}
```

| Field        | Meaning                                                            |
| ------------ | ------------------------------------------------------------------ |
| `data`       | The page of applications, ordered as described below.              |
| `total`      | Documents matching the filter for this applicant — **not** the page size. |
| `page`       | 1-based page returned.                                             |
| `limit`      | Maximum number of documents `data` may contain.                    |
| `totalPages` | `ceil(total / limit)`; `0` when there are no results.              |

## Query parameters

All parameters are URL-backed, optional, and validated by
`ScholarshipApplicationHistoryQueryDto`.

| Parameter   | Type                                            | Default   | Range                     |
| ----------- | ----------------------------------------------- | --------- | ------------------------- |
| `page`      | integer                                         | `1`       | `≥ 1`                     |
| `limit`     | integer                                         | `20`      | `1 … 100`                 |
| `sortBy`    | `createdAt` \| `updatedAt` \| `status`          | `createdAt` | —                       |
| `sortOrder` | `asc` \| `desc`                                 | `desc`    | —                         |

`sortBy` is a whitelist, not a pass-through: a caller cannot sort by an
arbitrary document field, and the service can rely on knowing which field needs
a tie-breaker.

`limit` is capped at **100** in two independent places:

- `@Max(APPLICATION_HISTORY_MAX_LIMIT)` rejects an oversized request with `400`
  before it reaches the service.
- `listMine` clamps with `Math.min(...)`, so an internal caller (a job, a new
  route) cannot reintroduce an unbounded page.

### Deterministic ordering

The sort always ends with `_id` in the same direction as the requested field:

```ts
const sortOrder = query.sortOrder === SortOrder.ASC ? 1 : -1;
{ [sortField]: sortOrder, _id: sortOrder }
```

`_id` is unique, so the ordering is a total order: every row has exactly one
position, and that position does not change between requests. This is what makes
offset paging safe here. Note that `_id` ordering is only a *tie-breaker*, never
a substitute for the timestamp: for documents created in ascending `createdAt`
order, a descending `_id` tie-break is what reverses the ties, which is what a
"newest first" list wants.

`PaginationService.paginate` gained an optional `sort` parameter for this. When
supplied it replaces the `sortBy`/`sortOrder` pair, so the tie-breaker is
visible at the call site instead of being re-derived inside the paginator. The
same tie-breaker was applied to the staff-facing
`GET scholarships/programs/:programId/applications`, which had the identical
`{ createdAt: -1 }` sort.

## Authorization and tenancy

- **Authorization.** The route is `@Roles(Role.STUDENT)` behind
  `JwtAuthGuard` + `RolesGuard`. Unchanged.
- **Ownership.** `applicantId` comes from `@CurrentUser('sub')` — the verified
  JWT subject — and is never read from the query string. A student cannot page
  another student's history, and there is no parameter through which to attempt
  it.
- **Tenancy.** Applications carry the `organizationId` of the sponsor that owns
  the program. A student is not a member of those organizations, so filtering on
  `organizationId` would be wrong here: the filter is `{ applicantId }` only,
  and a student legitimately sees applications across many sponsors. The
  organization boundary is still enforced everywhere that matters — staff views
  (`listForProgram`) filter on `organizationId` **and** verify the program belongs
  to it.

## Operational impact

| Area            | Impact                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| API             | **Breaking.** The body was a bare array, now an envelope. Clients reading `body.length` must read `body.data.length` and `body.total`. |
| Memory / latency | Per-request work is now `O(limit)` instead of `O(history)`. |
| Database        | The existing `{ applicantId: 1, status: 1 }` index serves the filter and the `total` count. The `{ applicantId, createdAt, _id }` sort is not covered by it, so a student with a very large history pays an in-memory sort per page; add a covering index `{ applicantId: 1, createdAt: -1, _id: -1 }` if that shows up in traces. |
| Caching         | Response is now cacheable per `(applicantId, page, limit, sortBy, sortOrder)`. |
| Monitoring      | Alert on `total / limit` growth for heavy accounts; a student with thousands of applications is usually a sign of a client bug, not a real user. |

Note on the count: `countDocuments` is exact but not free. It is a
`countDocuments({ applicantId })` on every request. If that shows up in traces,
the cheaper alternative is a `$facet` that returns the page and the count from
one round trip, or a capped count (`estimatedDocumentCount` on a
`$indexOnly` scan) with an explicit `totalIsEstimate` flag in the envelope.

## Regression coverage

`src/scholarships/__tests__/scholarship-applications.service.spec.ts`

Envelope and bounds:

- `scopes the history to the authenticated applicant` — the filter is
  `{ applicantId }` and the sort is `{ createdAt: -1, _id: -1 }`.
- `adds a deterministic _id tie-breaker to the requested sort field` — sorting
  by `updatedAt` ascending yields `{ updatedAt: 1, _id: 1 }`.
- `caps the page size at the documented maximum even if bypassed` — `limit: 5000`
  is clamped to 100.

Large-history correctness, run against the **real** `PaginationService` over an
in-memory model (not a mock, so the sort and skip arithmetic is actually
exercised):

- `walks a 250-application history with no duplicates and no gaps` — pages with
  `limit: 25` until exhausted, then asserts the concatenation equals the stored
  set (no gaps) and has no repeated id (no duplicates). 50 of the 250 rows share
  one `createdAt` value on purpose: that is the exact condition that produced
  duplicates before the tie-breaker existed.
- `returns the same page for a tied sort field on repeated calls` — 80 of 120
  rows share a timestamp, straddling the page-2 boundary; two identical
  requests must return identical rows.
- `never leaks another applicant’s applications` — a second applicant's rows are
  present in the collection and must not appear in, or be counted by, the
  response.

`PaginationService.paginate` keeps its original behaviour when no `sort` is
passed, so no other caller changes.
