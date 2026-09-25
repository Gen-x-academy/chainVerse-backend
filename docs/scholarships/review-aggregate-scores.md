# Scholarship Review — Normalized Aggregate Scores

> **Issue:** [#1147 — Calculate normalized aggregate scores](https://github.com/Gen-x-academy/chainVerse-backend/issues/1147)
> **Module:** `src/scholarships/`
> **Collection:** `scholarship_reviews`
> **Owner:** Platform / Scholarships team

---

## Overview

This feature adds a multi-reviewer rubric scoring system to scholarship
applications.  Each reviewer scores an application against a weighted set of
rubric criteria.  The service combines those individual scores into a single
**normalized aggregate score** that can be used to rank applicants objectively.

Key design goals satisfied by this implementation:

- **Reproducibility** — given the same stored criteria values the aggregate is
  always identical.  Any caller can re-derive the score from the raw document.
- **Precision & rounding** — scores are rounded to 4 decimal places using
  "round half away from zero" semantics at every step.
- **Missing-review safety** — PENDING and ABSTAINED reviews are excluded from
  the divisor; a partial panel cannot silently deflate a score.
- **Deterministic tie policy** — applications that share the same rounded
  aggregate are ranked by the earliest COMPLETED review `submittedAt` ascending.
- **Tenant isolation** — every document carries `organizationId`; all queries
  are scoped to the requesting tenant.
- **Privacy** — individual reviewer identities and per-criterion scores are
  staff-only data; only the blinded aggregate is safe for broader exposure.

---

## Review Lifecycle

```
(reviewer assigned)
      │
      ▼
   PENDING ──submit()──► COMPLETED  ← contributes to aggregate
      │
      └──abstain()──────► ABSTAINED  ← excluded from aggregate
```

| Status      | Contributes to aggregate? | Counts in divisor? |
|-------------|--------------------------|-------------------|
| `pending`   | ❌ No                    | ❌ No             |
| `completed` | ✅ Yes                   | ✅ Yes            |
| `abstained` | ❌ No                    | ❌ No             |

A reviewer may submit **exactly one** review or abstention per application.
Attempting a second submission returns `409 BIZ_REVIEW_ALREADY_EXISTS`.

---

## Scoring Algorithm

### Per-review normalized score

For each COMPLETED review, the service computes:

```
normalizedScore = Σ ( criterion.score / criterion.maxScore ) × criterion.weight
```

- `score` ∈ [0, `maxScore`]
- `maxScore` > 0
- `weight` ∈ (0, 1]; all weights across the review must sum to **1.0 ± 0.001**
- Result is rounded to **4 decimal places** and stored in `normalizedScore`
- Range: [0, 1]

### Aggregate score (across all reviewers)

```
aggregateScore = mean( normalizedScore_i  for each COMPLETED review i )
               = ( Σ normalizedScore_i ) / completedReviewCount
```

Rounded to **4 decimal places**.  Range: [0, 1].

### Reproducibility guarantee

Criteria sub-documents are **immutable** after submission.  Running the
algorithm again on the same COMPLETED reviews always yields the same
`aggregateScore`.  The formula and precision constant (`AGGREGATE_SCORE_PRECISION = 4`)
are documented in `src/scholarships/services/scholarship-review.service.ts`.

### Precision constants (service layer)

| Constant | Value | Purpose |
|---|---|---|
| `AGGREGATE_SCORE_PRECISION` | `4` | Decimal places for all rounding |
| `WEIGHT_SUM_TOLERANCE` | `0.001` | Allowable IEEE-754 drift in weight sum |

---

## Tie Policy

When two or more applications share the same rounded `aggregateScore`, the
ranking endpoint (`GET /rankings`) breaks the tie by:

> **Earliest COMPLETED review `submittedAt` ascending** — the application
> whose first completed review arrived soonest wins.

This is deterministic and reproducible from immutable inputs.  The tie-break
is applied server-side during `getProgramRankings`; no client-side sort is
required.

---

## Data Model

### `ScholarshipReview`  (`scholarship_reviews`)

| Field | Type | Notes |
|---|---|---|
| `organizationId` | string | Tenant scope; mirrors the owning application |
| `applicationId` | ObjectId → `ScholarshipApplication` | Target application |
| `programId` | ObjectId → `ScholarshipProgram` | Denormalized for query efficiency |
| `reviewerId` | string | JWT `sub` of the staff reviewer |
| `status` | `pending \| completed \| abstained` | Review lifecycle state |
| `criteria` | `ReviewCriterion[]` | Per-criterion scores (immutable after submit) |
| `normalizedScore` | number \| null | Server-computed weighted score ∈ [0,1]; null until COMPLETED |
| `overallComment` | string? | Optional free-text reviewer comment |
| `submittedAt` | Date? | Set when status → COMPLETED or ABSTAINED |
| `createdAt` | Date | Auto-managed by Mongoose |
| `updatedAt` | Date | Auto-managed by Mongoose |

### `ReviewCriterion` (embedded sub-document)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `criterionKey` | string | max 100 chars | Stable slug (e.g. `"academic_merit"`) |
| `label` | string | max 200 chars | Human-readable dimension name |
| `score` | number | [0, `maxScore`] | Reviewer's awarded score |
| `maxScore` | number | ≥ 1 | Maximum possible score for normalization |
| `weight` | number | (0, 1] | Relative importance; all weights must sum to 1.0 ± 0.001 |
| `justification` | string? | max 1 000 chars | Optional per-criterion rationale |

### Indexes

| Fields | Type | Purpose |
|---|---|---|
| `{ applicationId, reviewerId }` | unique | Enforce one review per reviewer per application |
| `{ applicationId, status }` | compound | Efficient aggregate computation |
| `{ organizationId, programId, status }` | compound | Program-level ranking queries |
| `{ reviewerId }` | single | Look up all reviews by a given reviewer |

---

## API Endpoints

All routes are nested under `/scholarships/programs/:programId` and require
a valid JWT plus organization membership verified by `OrganizationRolesGuard`.
`organizationId` is always passed as a query parameter.

| Method | Path | Roles | Description |
|---|---|---|---|
| `POST` | `/scholarships/programs/:programId/applications/:applicationId/reviews` | OWNER, ADMIN, INSTRUCTOR | Submit a rubric review |
| `POST` | `/scholarships/programs/:programId/applications/:applicationId/reviews/abstain` | OWNER, ADMIN, INSTRUCTOR | Record a formal abstention |
| `GET` | `/scholarships/programs/:programId/applications/:applicationId/reviews` | OWNER, ADMIN, INSTRUCTOR | List reviews (with optional `?status=` filter) |
| `GET` | `/scholarships/programs/:programId/reviews/:reviewId` | OWNER, ADMIN, INSTRUCTOR | Get a single review |
| `GET` | `/scholarships/programs/:programId/applications/:applicationId/reviews/aggregate` | OWNER, ADMIN, INSTRUCTOR | Get the normalized aggregate score for one application |
| `GET` | `/scholarships/programs/:programId/rankings` | OWNER, ADMIN | Get all applications ranked by aggregate score |

### `POST …/reviews` — Submit review

Request body (`SubmitReviewDto`):

```json
{
  "criteria": [
    {
      "criterionKey": "academic_merit",
      "label": "Academic Merit",
      "score": 8,
      "maxScore": 10,
      "weight": 0.4,
      "justification": "Strong GPA and relevant coursework."
    },
    {
      "criterionKey": "financial_need",
      "label": "Financial Need",
      "score": 9,
      "maxScore": 10,
      "weight": 0.35
    },
    {
      "criterionKey": "community_impact",
      "label": "Community Impact",
      "score": 7,
      "maxScore": 10,
      "weight": 0.25
    }
  ],
  "overallComment": "Strong candidate overall."
}
```

Computed `normalizedScore`:
`(8/10 × 0.4) + (9/10 × 0.35) + (7/10 × 0.25) = 0.32 + 0.315 + 0.175 = 0.8100`

Response: the persisted `ScholarshipReview` document.

### `GET …/reviews/aggregate` — Single-application aggregate

Response (`AggregateScoreResult`):

```json
{
  "applicationId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
  "programId": "64f1a2b3c4d5e6f7a8b9c0cf",
  "aggregateScore": 0.7925,
  "completedReviewCount": 3,
  "pendingReviewCount": 1,
  "abstainedReviewCount": 0,
  "computedAt": "2026-09-25T14:00:00.000Z"
}
```

Returns `422 BIZ_NO_COMPLETED_REVIEWS` when there are no completed reviews
rather than a misleading `0.0`.

### `GET …/rankings` — Program rankings

Returns an array of `AggregateScoreResult` objects sorted by:
1. `aggregateScore` descending (highest first)
2. Earliest COMPLETED review `submittedAt` ascending (tie-break)

Only applications with ≥ 1 COMPLETED review are included.

---

## Validation Rules & Error Codes

| Condition | Error code | HTTP |
|---|---|---|
| `criteria` array is empty | `VAL_RUBRIC_CRITERIA_EMPTY` | 400 |
| `criterion.score > criterion.maxScore` | `VAL_RUBRIC_SCORE_OUT_OF_RANGE` | 400 |
| Weights do not sum to 1.0 ± 0.001 | `VAL_RUBRIC_WEIGHTS_INVALID` | 400 |
| Application is not in `UNDER_REVIEW` status | `BIZ_APPLICATION_NOT_UNDER_REVIEW` | 409 |
| Reviewer already submitted for this application | `BIZ_REVIEW_ALREADY_EXISTS` | 409 |
| No completed reviews exist for aggregate computation | `BIZ_NO_COMPLETED_REVIEWS` | 409 |
| Review document not found | `RES_SCHOLARSHIP_REVIEW_NOT_FOUND` | 404 |
| Application not found / wrong tenant | `RES_SCHOLARSHIP_APPLICATION_NOT_FOUND` | 404 |
| Program not found / wrong tenant | `RES_SCHOLARSHIP_PROGRAM_NOT_FOUND` | 404 |

---

## Authorization Summary

| Action | Required org role |
|---|---|
| Submit / abstain review | OWNER, ADMIN, INSTRUCTOR |
| List / get reviews (with reviewer identities) | OWNER, ADMIN, INSTRUCTOR |
| Get aggregate score (blinded) | OWNER, ADMIN, INSTRUCTOR |
| Get program rankings | OWNER, ADMIN |

Platform `admin` retains the documented break-glass bypass (acts as OWNER on
any organization) via `OrganizationRolesGuard`.

---

## Privacy Considerations

- `reviewerId` and per-criterion `score` / `justification` values are
  **internal staff data**.  They must not be returned to applicants.
- Only the blinded `aggregateScore` from `GET …/reviews/aggregate` or
  `GET …/rankings` is safe for wider exposure.
- `overallComment` may contain staff opinions about an applicant and should
  be treated as PII-adjacent; do not include it in applicant-facing responses.
- All review documents are tenant-scoped via `organizationId`.

---

## Migration Notes

- **New collection** `scholarship_reviews`.  No existing data is affected.
- The unique compound index `{ applicationId, reviewerId }` is created
  automatically by Mongoose at boot.  In environments where `autoIndex` is
  disabled, run:
  ```js
  db.scholarship_reviews.createIndex(
    { applicationId: 1, reviewerId: 1 },
    { unique: true }
  )
  ```
- No new environment variables are required.
- No changes to existing collections or schemas.

---

## Operational Impact

- **No new external service dependencies.**
- The `GET …/rankings` endpoint performs two MongoDB queries (all COMPLETED
  reviews for the program + pending/abstained counts) and one application
  lookup.  For programs with large panels, ensure the compound indexes
  `{ organizationId, programId, status }` and `{ applicationId, status }` are
  in place before enabling in production.
- Aggregate computation is performed in application memory, not via a MongoDB
  aggregation pipeline.  For programs with thousands of applications × dozens
  of reviewers, consider offloading the ranking query to a background job and
  caching results.
- `normalizedScore` is recomputed and stored on every `submitReview` call,
  keeping the document self-consistent and enabling fast single-document reads
  without re-running the formula.
