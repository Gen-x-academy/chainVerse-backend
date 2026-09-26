# Scholarship Award Records

**Issue:** [#1151](https://github.com/Gen-x-academy/chainVerse-backend/issues/1151)  
**Domain:** Scholarships — Awards  
**Collection:** `scholarship_awards`

---

## Overview

Once a committee decision resolves to **AWARDED** and an organization confirms
the grant, the system materializes a formal **award record** that carries:

- Monetary **amount** and **currency**
- Prose **terms** the applicant agrees to on acceptance
- Structured **disbursement milestones** (optional)
- An **acceptance deadline** — the offer expires automatically when it elapses
- A link to the backing **BudgetReservation** (if budget tracking is enabled)

The award record is the authoritative source of truth for an applicant's grant.
It is distinct from the BudgetReservation (which tracks the financial hold) and
from the CommitteeDecision (which records how the outcome was reached).

---

## Ownership & Tenant Isolation

- Every document carries `organizationId` (tenant scope).
- All staff API routes accept `?organizationId=` as a query parameter.
- `OrganizationRolesGuard` validates organization membership before any staff
  handler runs.
- The service performs a second ownership check (`{ _id, organizationId }`) on
  every query, so cross-tenant reads are structurally impossible.
- Applicant routes (accept/decline/read-own) verify `award.applicantId === JWT sub`
  rather than org membership — applicants are students, not org members.

---

## Award Lifecycle

```
PENDING_ACCEPTANCE ──▶ ACCEPTED  ──▶ RESCINDED
        │
        ├──▶ DECLINED      (applicant declines)
        └──▶ OFFER_EXPIRED (cron — deadline elapsed)
```

| Transition | Trigger | Budget side-effect |
|---|---|---|
| `PENDING_ACCEPTANCE → ACCEPTED` | Applicant accepts (authenticated) | Reservation PENDING → CONFIRMED (`reservedAmount −= amount`, `disbursedAmount += amount`) |
| `PENDING_ACCEPTANCE → DECLINED` | Applicant declines | Reservation PENDING → CANCELLED (`reservedAmount −= amount`) |
| `PENDING_ACCEPTANCE → OFFER_EXPIRED` | Cron job — deadline elapsed | Reservation PENDING → EXPIRED (`reservedAmount −= amount`) |
| `ACCEPTED → RESCINDED` | Organization OWNER rescinds | Reservation CONFIRMED → RELEASED (`disbursedAmount −= amount`) |

**Terminal states:** `DECLINED`, `OFFER_EXPIRED`, `RESCINDED` — no further transitions permitted.

---

## Conflict Prevention

Before creating a new award the service enforces:

> **An applicant cannot hold conflicting awards.**

The query:
```
{ applicantId, organizationId, status: { $in: ['pending_acceptance', 'accepted'] } }
```
is executed before persisting.  If a match is found, `BIZ_AWARD_CONFLICT` (422)
is returned.  This prevents an applicant from simultaneously holding two active
awards within the same tenant.

A compound index `{ applicantId, organizationId, status }` makes this check
efficient at scale.

---

## Acceptance Authentication

The `accept` and `decline` endpoints (`POST /scholarships/awards/:awardId/accept|decline`)
are applicant-facing.  They require a valid JWT but do **not** require org membership.
The service asserts `award.applicantId === request.user.sub` and returns
`403 BIZ_AWARD_ACCEPTANCE_FORBIDDEN` for any other caller.

---

## Scheduled Expiry Jobs

`ScholarshipAwardService` registers two `@Cron` jobs in `@nestjs/schedule`:

| Job name | Schedule | Purpose |
|---|---|---|
| `scholarship-award-expiry` | Every hour | Primary expiry sweep |
| `scholarship-award-expiry-reconciliation` | Every 6 hours | Safety-net for missed runs |

Both call `runExpiryJob()` which:
1. Queries `{ status: 'pending_acceptance', acceptanceDeadline: { $lte: now } }`
   (served by a partial index on PENDING_ACCEPTANCE documents).
2. For each candidate, issues a conditional `findOneAndUpdate` with
   `status: PENDING_ACCEPTANCE` in the filter — exactly-once guarantee.
3. On success, transitions the linked `BudgetReservation` PENDING → EXPIRED and
   decrements `BudgetLedger.reservedAmount`.
4. Logs the count of expired awards.

The jobs are **idempotent** — re-running them multiple times is safe.

**Operational note:** In a multi-instance deployment use a distributed lock
(e.g. Redis `SET NX`) or a dedicated worker to prevent concurrent expiry
processing across replicas.

---

## Budget Reservation Integration

When `reservationId` is supplied at award creation time, the service links the
`BudgetReservation` document.  All subsequent lifecycle transitions automatically
propagate to the reservation:

| Award transition | Reservation transition | Ledger effect |
|---|---|---|
| PENDING_ACCEPTANCE → ACCEPTED | PENDING → CONFIRMED | `reservedAmount −=`, `disbursedAmount +=` |
| PENDING_ACCEPTANCE → DECLINED | PENDING → CANCELLED | `reservedAmount −=` |
| PENDING_ACCEPTANCE → OFFER_EXPIRED | PENDING → EXPIRED | `reservedAmount −=` |
| ACCEPTED → RESCINDED | CONFIRMED → RELEASED | `disbursedAmount −=` |

All reservation mutations use conditional `findOneAndUpdate` (exactly-once).
If the reservation has already been transitioned by a concurrent operation the
update matches 0 documents and the service skips it silently (idempotent).

Awards with `reservationId: null` (unfunded / honorific awards) skip all
reservation steps.

---

## API Routes

All staff routes require `?organizationId=<id>` and a valid JWT.
Applicant routes require a valid JWT with the applicant's own `sub`.

### Staff (OWNER | ADMIN)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/scholarships/programs/:programId/applications/:applicationId/award` | OWNER, ADMIN | Create award for an approved application |
| `GET` | `/scholarships/programs/:programId/awards` | OWNER, ADMIN | List all awards for a program |
| `GET` | `/scholarships/programs/:programId/applications/:applicationId/award` | OWNER, ADMIN | Get the award for a specific application |

### Staff (OWNER only)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/scholarships/awards/:awardId/rescind` | OWNER | Rescind an ACCEPTED award |

### Applicant (JWT — own award only)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/scholarships/awards/:awardId` | Applicant (JWT) | Read own award details |
| `POST` | `/scholarships/awards/:awardId/accept` | Applicant (JWT) | Accept the offer |
| `POST` | `/scholarships/awards/:awardId/decline` | Applicant (JWT) | Decline the offer |

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `RES_SCHOLARSHIP_AWARD_NOT_FOUND` | 404 | Award record not found |
| `BIZ_AWARD_ALREADY_EXISTS` | 409 | A non-terminal award already exists for this application |
| `BIZ_AWARD_CONFLICT` | 422 | Applicant already holds an active award in this organization |
| `VAL_AWARD_ACCEPTANCE_DEADLINE_PAST` | 400 | `acceptanceDeadline` is not a future date |
| `BIZ_AWARD_INVALID_STATE` | 422 | Status transition not permitted from current state |
| `BIZ_AWARD_OFFER_EXPIRED` | 422 | Acceptance deadline has passed; offer expired |
| `BIZ_AWARD_ACCEPTANCE_FORBIDDEN` | 403 | Caller is not the applicant on this award |
| `VAL_AWARD_MILESTONE_DATE_INVALID` | 400 | Milestone `startsAt` is not before `endsAt` |

---

## Migration

One new collection is created automatically by Mongoose on first use:

- `scholarship_awards`

No existing collections are modified.

**Indexes created at startup:**

| Index | Purpose |
|---|---|
| `{ organizationId: 1 }` | Tenant-scoped queries |
| `{ applicationId: 1 }` (unique) | One award per application |
| `{ programId: 1 }` | Program-level listing |
| `{ applicantId: 1 }` | Applicant self-read |
| `{ applicantId: 1, organizationId: 1, status: 1 }` | Conflict detection |
| `{ organizationId: 1, programId: 1, status: 1 }` | Program list with status filter |
| `{ status: 1, acceptanceDeadline: 1 }` (partial — PENDING_ACCEPTANCE only) | Cron expiry sweep |

---

## Privacy

- `termsText` may contain legally sensitive conditions; restrict to OWNER/ADMIN
  and the award's own applicant.
- `rescissionReason` and `statusHistory` are staff-only; never expose to other
  applicants.
- Award amounts are internal financial data scoped to the tenant.
- The applicant-facing `GET /scholarships/awards/:awardId` endpoint enforces
  that only the award's own applicant can read their record.

---

## Operational Impact

- Two cron jobs run in every application instance.  Use a distributed lock in
  multi-replica deployments to avoid duplicate expiry processing.
- Historical (declined / expired / rescinded) award documents are retained
  indefinitely for audit and compliance.  Archive to a cold-storage collection
  for high-volume programs.
- `statusHistory` grows with every transition.  For awards with many
  rescission/re-issuance cycles consider archiving older entries.
