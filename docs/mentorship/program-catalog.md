# Issue #1301 — Add Program Catalog and Filtering (MENTOR-027)

## Context

ChainVerse provides 1-on-1 mentorship with smart-contract-backed payments. This document covers the backend implementation of shared work item **MENTOR-027** in the Discovery track.

**Audit baseline**
- Repository: `Gen-x-academy/chainVerse-backend`
- Audited branch: `main`
- Audited commit: `c268376358e465bb4676455485797a26cdd964e2`
- Audit date: 2026-10-16

> This spec must be revalidated against the latest `main` before implementation begins.

---

## Goal

Allow mentees to discover published mentorship programs by browsing and filtering against a rich set of program attributes, with stable pagination and refreshed seat availability.

---

## Functional Scope

| Dimension | Notes |
|---|---|
| Organization | Filter by the organization that published the program |
| Topic / expertise area | Filter by subject matter or skill tag |
| Cohort date | Filter by upcoming or active cohort start date |
| Duration | Filter by program length (e.g., 4 weeks, 3 months) |
| Mode | Delivery format: video, async, hybrid, in-person |
| Eligibility | Preview eligibility criteria before applying |
| Fee | Filter by fee range or free programs |
| Seat status | Filter by available, waitlisted, or full; stale counts are refreshed |

Only **published** (visible) programs appear in catalog results. Draft, archived, or suspended programs must be excluded.

---

## Domain Model

### `MentorshipProgram`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `organizationId` | UUID | FK → Organization; publisher of the program |
| `title` | string | Display name |
| `description` | text | Full description |
| `topic` | string[] | Normalized topic / skill tags |
| `cohortStartDate` | date | Start of the next or active cohort |
| `durationWeeks` | integer | Program length in weeks |
| `deliveryMode` | enum | `video`, `audio`, `async`, `hybrid`, `in_person` |
| `eligibilityCriteria` | text | Human-readable eligibility summary |
| `feeAmount` | numeric | Fee in platform base currency; `0` for free |
| `feeCurrency` | string | ISO 4217 currency code |
| `totalSeats` | integer | Maximum enrollment capacity |
| `enrolledCount` | integer | Current confirmed enrollments |
| `waitlistedCount` | integer | Current waitlist length |
| `status` | enum | `draft`, `published`, `archived`, `suspended` |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |
| `seatStatusRefreshedAt` | timestamptz | Last time seat counts were recalculated |

**Computed seat status** (not stored):
- `available` — `enrolledCount < totalSeats`
- `waitlisted` — `enrolledCount >= totalSeats && waitlistedCount > 0`
- `full` — `enrolledCount >= totalSeats && waitlistedCount === 0`

---

## REST API

All endpoints require authentication. Authorization is deny-by-default — unauthenticated callers receive `401`.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/mentorship/programs` | List and filter published programs (paginated) |
| `GET` | `/mentorship/programs/:programId` | Retrieve a single published program |

### Query Parameters — `GET /mentorship/programs`

| Parameter | Type | Description |
|---|---|---|
| `organizationId` | UUID | Filter by publishing organization |
| `topic` | string (multi) | Filter by one or more topic tags (OR logic) |
| `cohortAfter` | ISO date | Only programs with `cohortStartDate >= cohortAfter` |
| `cohortBefore` | ISO date | Only programs with `cohortStartDate <= cohortBefore` |
| `minDurationWeeks` | integer | Minimum duration |
| `maxDurationWeeks` | integer | Maximum duration |
| `deliveryMode` | enum (multi) | Filter by one or more delivery modes |
| `maxFee` | numeric | Maximum fee; `0` to return free programs only |
| `seatStatus` | enum (multi) | `available`, `waitlisted`, `full` |
| `page` | integer | 1-based page number (default: 1) |
| `pageSize` | integer | Results per page (default: 20, max: 100) |
| `sort` | string | `cohortStartDate`, `feeAmount`, `createdAt` (default: `cohortStartDate`) |
| `order` | string | `asc` or `desc` (default: `asc`) |

Filters are **AND**-combined across dimensions; multiple values within a single dimension use **OR** logic.

**Shareable filters:** All filter state is expressed as query parameters so that a filtered URL can be bookmarked or shared.

### Response Shape — `GET /mentorship/programs`

```json
{
  "data": [
    {
      "programId": "uuid",
      "title": "string",
      "organizationId": "uuid",
      "topic": ["Solidity", "Smart Contracts"],
      "cohortStartDate": "2026-11-01",
      "durationWeeks": 8,
      "deliveryMode": "video",
      "eligibilityPreview": "string (short summary)",
      "fee": {
        "amount": 0,
        "currency": "USD",
        "label": "Free"
      },
      "seats": {
        "total": 30,
        "enrolled": 12,
        "waitlisted": 0,
        "status": "available",
        "refreshedAt": "ISO-8601"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 45,
    "totalPages": 3
  }
}
```

**Eligibility preview** is a short, human-readable string surfaced from `eligibilityCriteria` — it must explain the criteria, not merely state "check eligibility." Full eligibility detail is available on the single-program endpoint.

---

## Authorization Policy

- Catalog endpoints are accessible to any authenticated user.
- Only programs with `status = 'published'` are returned; other statuses are invisible to non-admin callers.
- Organization administrators may see their own organization's draft programs via a separate admin endpoint (out of scope for this issue).
- No caller-supplied program ID can be used to read non-published programs through the catalog path.

---

## Persistence Notes

- Index on `(status, cohortStartDate)` for primary catalog query.
- Composite indexes on frequently filtered combinations: `(status, organizationId)`, `(status, deliveryMode)`.
- `topic` stored as a normalized array column (PostgreSQL `text[]`) or a join table — document the chosen approach.
- Pagination uses keyset or offset pagination; document the chosen approach and its stability guarantees.

---

## Seat Status Refresh

Seat counts (`enrolledCount`, `waitlistedCount`) can become stale between enrollment events. A background job or enrollment-event subscriber must:

1. Recalculate counts when enrollment or waitlist events are received.
2. Update `seatStatusRefreshedAt` on each recalculation.
3. The API must surface `refreshedAt` so clients know how fresh the data is.

**Staleness threshold:** If `seatStatusRefreshedAt` is older than a configurable threshold (default: 5 minutes), the API may trigger an inline refresh before responding, or return the stale count with a `stale: true` flag — document the chosen approach.

---

## Background / Async Behavior

| Event | Action |
|---|---|
| Enrollment confirmed | Increment `enrolledCount`; recalculate seat status |
| Enrollment cancelled | Decrement `enrolledCount`; promote from waitlist if applicable |
| Waitlist join | Increment `waitlistedCount` |
| Waitlist leave | Decrement `waitlistedCount` |
| Program published | Make visible in catalog immediately |
| Program archived/suspended | Remove from catalog immediately; no pending requests should surface it |

---

## Acceptance Criteria

- [ ] Only `published` programs appear in catalog results.
- [ ] All listed filter dimensions work individually and in combination.
- [ ] Filter state is fully expressible as query parameters (shareable URLs).
- [ ] Eligibility preview is present and human-readable for every program in the list response.
- [ ] Pagination is stable: adding or removing items between pages does not cause entries to be skipped or duplicated.
- [ ] Outdated seat status is refreshed; `refreshedAt` is surfaced in the response.
- [ ] OpenAPI documentation is updated for both endpoints and all query parameters.
- [ ] Unit and integration tests cover: success, validation, authorization denial, each filter dimension, pagination edge cases, idempotency, and failure paths.
- [ ] Retries do not duplicate effects.
- [ ] Errors are stable, typed, and actionable.
- [ ] Operational telemetry is added for catalog queries and seat status refresh events.

---

## Privacy Boundaries

| Data | Visibility |
|---|---|
| Published program details | Any authenticated user |
| Draft / archived / suspended programs | Hidden from catalog; admin endpoints only |
| Enrolled mentee identities | Never exposed in catalog responses |
| Organization internal notes | Must not appear in catalog responses |

---

## Rollout Considerations

- New `mentorship_programs` table — no migration conflicts expected.
- Seat status refresh can be deployed independently of the enrollment workflow; counts default to `0` until enrollment events flow.
- Feature can be deployed behind a feature flag until the frontend catalog UI (MENTOR-027 frontend) is ready.
- Page size cap (`100`) and staleness threshold (`5 minutes`) should be configurable via environment variables.

---

## Dependencies

| Dependency | Notes |
|---|---|
| Mentee auth / JWT | Caller identity must be resolvable from the token |
| Organization records | `organizationId` must reference existing organization rows |
| Enrollment service | Source of `enrolledCount` and `waitlistedCount` events |
| MENTOR-025 / Issue #1298 | Shortlists — mentees may save programs discovered here |
| MENTOR-026 / Issue #1299 | Comparison — programs feed into mentor comparison flow |
| MENTOR-027 (other repos) | Corresponding frontend work in `chainVerse-frontend` |
| MENTOR-029 / Issue #1304 | Abuse and scraping controls apply to this catalog surface |

---

## References

- GitHub Issue: [#1301](https://github.com/Gen-x-academy/chainVerse-backend/issues/1301)
- Related: [#1298 — Saved Mentor Shortlists](https://github.com/Gen-x-academy/chainVerse-backend/issues/1298)
- Related: [#1299 — Mentor Comparison Workflow](https://github.com/Gen-x-academy/chainVerse-backend/issues/1299)
- Related: [#1304 — Discovery Abuse and Scraping Controls](https://github.com/Gen-x-academy/chainVerse-backend/issues/1304)
