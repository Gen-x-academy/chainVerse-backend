# Applicant Appeals — Scholarship Decisions

> **Issue:** [#1150](https://github.com/Gen-x-academy/chainVerse-backend/issues/1150)
> **Module:** `src/scholarships/`
> **Collection:** `scholarship_application_appeals`

---

## Overview

The appeals feature lets a scholarship applicant formally contest a **rejected** decision. An appeal carries structured grounds, a detailed statement, and optional supporting evidence. A separate staff member (who was not an original reviewer) is assigned to evaluate it, and the outcome is either **upheld** (the application is returned to review) or **dismissed** (the original decision stands).

---

## Eligibility

An appeal may be filed only when **at least one** of the following is true:

| Condition | Field checked |
|-----------|--------------|
| Application `status` is `rejected` | `ScholarshipApplication.status` |
| CommitteeDecision `outcome` is `rejected` | `CommitteeDecision.outcome` |

Any other application state (submitted, under_review, approved, withdrawn) returns **422 BIZ_APPEAL_NOT_ELIGIBLE**.

---

## Lifecycle

```
                    ┌──────────────────────────────────────┐
                    │           PENDING                    │
                    │  (appeal submitted, awaiting staff)  │
                    └──────┬───────────────┬───────────────┘
                           │ staff assign  │ applicant
                           │               │ withdraws
                    ┌──────▼──────┐   ┌───▼──────┐
                    │ UNDER_REVIEW│   │ WITHDRAWN │ (terminal)
                    │ (assigned   │   └──────────┘
                    │  reviewer)  │
                    └──┬──────┬───┘
                       │      │
               ┌───────▼──┐  ┌▼────────┐
               │  UPHELD  │  │DISMISSED│  (terminal)
               │(app →    │  │(decision│
               │ UNDER_   │  │ stands) │
               │ REVIEW)  │  └─────────┘
               └──────────┘

   PENDING or UNDER_REVIEW → EXPIRED  (cron job, resolutionDeadline elapsed)
```

| Transition | Actor | From | To |
|-----------|-------|------|----|
| Submit | Applicant | — | `pending` |
| Assign reviewer | Staff (OWNER/ADMIN) | `pending` | `under_review` |
| Uphold | Staff (OWNER/ADMIN) | `under_review` | `upheld` |
| Dismiss | Staff (OWNER/ADMIN) | `under_review` | `dismissed` |
| Withdraw | Applicant | `pending` or `under_review` | `withdrawn` |
| Expire | Cron job | `pending` or `under_review` | `expired` |

Terminal states: `upheld`, `dismissed`, `withdrawn`, `expired`.

---

## Reviewer Exclusion

Original reviewers are **automatically excluded** from reviewing the appeal. At submission time the service queries:

- `ScholarshipReview.reviewerId` for all reviews of the application.
- `CommitteeDecision.votes[].memberId` for all non-superseded votes.

The union is stored in `excludedReviewerIds` on the appeal document. The assign endpoint rejects any `assignedReviewerId` found in this set with **422 BIZ_APPEAL_REVIEWER_EXCLUDED**.

---

## API Reference

### Applicant Routes

All applicant routes require a valid JWT. The service enforces ownership via `applicantId === JWT sub` — no org-role restriction beyond basic membership is needed, but `organizationId` must still be passed as a query parameter for tenant scoping.

#### Submit an appeal

```
POST /scholarships/programs/:programId/applications/:applicationId/appeals
     ?organizationId=<orgId>
```

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grounds` | `AppealGrounds` enum | ✓ | `procedural_error` \| `new_evidence` \| `bias_or_misconduct` \| `factual_error` \| `other` |
| `statement` | string (max 5 000) | ✓ | Detailed narrative explaining the basis for appeal |
| `evidence` | `AppealEvidenceDto[]` | — | Supporting evidence items (HTTPS URLs from the upload service) |
| `resolutionDeadline` | ISO-8601 UTC | — | Defaults to 30 days from submission |

**Returns:** 201 `AppealResult` (applicant view — no `reviewNotes`, `excludedReviewerIds`, or `auditTrail`).

**Error responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 403 | `AUTH_INSUFFICIENT_PERMISSIONS` | Caller is not the application owner |
| 404 | `RES_SCHOLARSHIP_APPLICATION_NOT_FOUND` | Application not found in org |
| 409 | `BIZ_APPEAL_ALREADY_ACTIVE` | An active appeal already exists |
| 422 | `BIZ_APPEAL_NOT_ELIGIBLE` | Application is not in an appealable state |
| 400 | `VAL_APPEAL_DEADLINE_PAST` | Supplied `resolutionDeadline` is in the past |

---

#### List own appeals for an application

```
GET /scholarships/programs/:programId/applications/:applicationId/appeals
    ?organizationId=<orgId>
```

Returns all appeals filed by the calling applicant for the application. Sorted newest-first.

---

#### Get a single appeal

```
GET /scholarships/appeals/:appealId
    ?organizationId=<orgId>
```

Returns the applicant view (staff-only fields omitted).

---

#### Withdraw an appeal

```
DELETE /scholarships/appeals/:appealId
       ?organizationId=<orgId>
```

**Body (optional):**

| Field | Type | Description |
|-------|------|-------------|
| `reason` | string (max 500) | Optional reason for withdrawal |

**Error responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 403 | `BIZ_APPEAL_WITHDRAW_FORBIDDEN` | Caller is not the applicant who filed the appeal |
| 422 | `BIZ_APPEAL_INVALID_STATE` | Appeal is already in a terminal state |

---

### Staff Routes

Restricted to **OWNER** or **ADMIN** organization role.

#### List all appeals for a program

```
GET /scholarships/programs/:programId/appeals
    ?organizationId=<orgId>
    [&status=pending|under_review|upheld|dismissed|withdrawn|expired]
    [&grounds=procedural_error|new_evidence|bias_or_misconduct|factual_error|other]
```

Returns the full staff view (includes `reviewNotes`, `excludedReviewerIds`, `auditTrail`). Sorted newest-first.

---

#### List appeals for a specific application (staff)

```
GET /scholarships/programs/:programId/applications/:applicationId/appeals/staff
    ?organizationId=<orgId>
    [&status=...] [&grounds=...]
```

---

#### Get a single appeal (staff view)

```
GET /scholarships/programs/:programId/appeals/:appealId
    ?organizationId=<orgId>
```

---

#### Assign a reviewer

```
PATCH /scholarships/programs/:programId/appeals/:appealId/assign
      ?organizationId=<orgId>
```

Transitions `pending` → `under_review`.

**Body (optional):**

| Field | Type | Description |
|-------|------|-------------|
| `assignedReviewerId` | string | JWT sub of the staff reviewer. Defaults to the calling user (self-assign). |

**Error responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 422 | `BIZ_APPEAL_INVALID_STATE` | Appeal is not in `pending` status |
| 422 | `BIZ_APPEAL_REVIEWER_EXCLUDED` | Proposed reviewer is an original reviewer |

---

#### Resolve an appeal

```
PATCH /scholarships/programs/:programId/appeals/:appealId/resolve
      ?organizationId=<orgId>
```

Transitions `under_review` → `upheld` or `dismissed`.

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resolution` | `upheld` \| `dismissed` | ✓ | Final decision |
| `reason` | string (max 2 000) | ✓ | Rationale shown to the applicant |
| `reviewNotes` | string (max 5 000) | — | Internal staff notes (never returned to applicant) |

**Side effect when UPHELD:**
The linked `ScholarshipApplication.status` is transitioned back to `under_review` and `decidedAt`/`decidedBy`/`decisionReason` are cleared, allowing a fresh review round with non-excluded reviewers.

**Error responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 422 | `BIZ_APPEAL_INVALID_STATE` | Appeal is not in `under_review` status |
| 422 | `BIZ_APPEAL_RESOLUTION_INVALID` | `resolution` is not `upheld` or `dismissed` |

---

## Data Model

### Collection: `scholarship_application_appeals`

| Field | Type | Notes |
|-------|------|-------|
| `organizationId` | string | Tenant scope (indexed) |
| `applicationId` | ObjectId → `ScholarshipApplication` | Indexed |
| `programId` | ObjectId → `ScholarshipProgram` | Denormalized for list queries |
| `applicantId` | string | JWT sub; denormalized for ownership checks |
| `excludedReviewerIds` | string[] | Original reviewer ids barred from this appeal |
| `grounds` | `AppealGrounds` | Enum (indexed) |
| `statement` | string (max 5 000) | Applicant narrative |
| `evidence` | `AppealEvidence[]` | label, url (HTTPS), description?, attachedAt |
| `status` | `AppealStatus` | Indexed |
| `resolutionDeadline` | Date | Indexed; cron expires past-deadline active appeals |
| `assignedReviewerId` | string \| null | Set on assign |
| `assignedAt` | Date \| null | Set on assign |
| `reviewNotes` | string \| null | Staff-only; max 5 000 chars |
| `resolvedAt` | Date \| null | Set on any terminal transition |
| `resolvedBy` | string \| null | JWT sub of resolver |
| `resolutionReason` | string \| null | Shown to applicant; max 2 000 chars |
| `withdrawalReason` | string \| null | Applicant-supplied; max 500 chars |
| `withdrawnAt` | Date \| null | Set on withdrawal |
| `auditTrail` | `AppealAuditEntry[]` | Append-only; staff-only |
| `createdAt` | Date | Mongoose timestamps |
| `updatedAt` | Date | Mongoose timestamps |

### Indexes

| Fields | Type | Purpose |
|--------|------|---------|
| `organizationId` | Single | Tenant isolation |
| `applicationId` | Single | Application-level list queries |
| `programId` | Single | Program-level list queries |
| `applicantId` | Single | Applicant-owned list queries |
| `(applicationId, status)` | Compound | Active-appeal uniqueness check |
| `(organizationId, programId, status)` | Compound | Program list with status filter |
| `(status, resolutionDeadline)` | Compound (partial) | Cron expiry sweep — only active statuses |

---

## Background Jobs

Two `@Cron` tasks run on the `ApplicationAppealService`:

| Job name | Schedule | Description |
|----------|----------|-------------|
| `scholarship-appeal-expiry` | Every hour | Transitions `pending` and `under_review` appeals past `resolutionDeadline` to `expired` |
| `scholarship-appeal-expiry-reconciliation` | Every 6 hours | Safety-net run to catch any appeals missed by the hourly job |

Both jobs use `updateMany` with a status + deadline predicate for idempotency — running multiple times on the same set produces the same result.

---

## Privacy

| Field | Visibility |
|-------|-----------|
| `statement` | Applicant + OWNER/ADMIN |
| `evidence` | Applicant + OWNER/ADMIN |
| `reviewNotes` | OWNER/ADMIN only — **never** returned to applicant |
| `excludedReviewerIds` | OWNER/ADMIN only |
| `auditTrail` | OWNER/ADMIN only |
| `resolutionReason` | Applicant + OWNER/ADMIN |

The `toApplicantResult` mapper in `ApplicationAppealService` strips `reviewNotes`, `excludedReviewerIds`, and `auditTrail` before returning data on applicant-facing endpoints.

---

## Migration

- **New collection:** `scholarship_application_appeals` — created on first write.
- **No existing collections are modified** by this feature, except that resolving an appeal as `upheld` writes a status update to the `scholarship_applications` collection (`status → under_review`).
- Compound indexes are created automatically when Mongoose `autoIndex` is enabled. Run `createIndex` manually in production environments where `autoIndex` is disabled.

---

## Ownership

- **Domain owner:** Scholarships team
- **Issue:** [Gen-x-academy/chainVerse-backend#1150](https://github.com/Gen-x-academy/chainVerse-backend/issues/1150)
- **Files introduced:**
  - `src/scholarships/schemas/application-appeal.schema.ts`
  - `src/scholarships/dto/application-appeal.dto.ts`
  - `src/scholarships/services/application-appeal.service.ts`
  - `src/scholarships/controllers/application-appeal.controller.ts`
  - `docs/scholarships/applicant-appeals.md` (this file)
- **Files modified:**
  - `src/scholarships/scholarships.module.ts` — schema, service, controllers registered
  - `src/common/errors/error-codes.enum.ts` — 9 new error codes added
