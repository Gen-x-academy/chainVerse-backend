0-# Scholarship Budget Reservations
# Scholarship Budget Reservations

**Issue:** [#1149](https://github.com/Gen-x-academy/chainVerse-backend/issues/1149)  
**Domain:** Scholarships — Award Decision / Budget  
**Collections:** `scholarship_budget_ledgers`, `scholarship_budget_reservations`

---

## Overview

When a committee awards a scholarship application the system must **hold** the
monetary value from the program's total budget before the applicant formally
accepts.  This prevents over-commitment when multiple awards are approved
concurrently.

The feature introduces two new MongoDB collections:

| Collection | Purpose |
|---|---|
| `scholarship_budget_ledgers` | One document per program; tracks `totalBudget`, `reservedAmount`, `disbursedAmount` |
| `scholarship_budget_reservations` | One document per award; tracks the per-application hold and its lifecycle |

---

## Ownership & Tenant Isolation

- All documents carry an `organizationId` field (tenant scope).
- Every API route accepts `?organizationId=` as a query parameter.
- `OrganizationRolesGuard` validates membership before any handler runs.
- The service layer performs a second ownership assertion on every query.

---

## Reservation Lifecycle

```
PENDING ──▶ CONFIRMED ──▶ RELEASED
   │
   ├──▶ EXPIRED   (automated — scheduled job)
   └──▶ CANCELLED (manual — OWNER / ADMIN)
```

| Transition | Trigger | Ledger effect |
|---|---|---|
| `PENDING → CONFIRMED` | Applicant accepts award | `reservedAmount −= amount`, `disbursedAmount += amount` |
| `PENDING → EXPIRED` | TTL elapsed (cron job) | `reservedAmount −= amount` |
| `PENDING → CANCELLED` | OWNER / ADMIN cancels | `reservedAmount −= amount` |
| `CONFIRMED → RELEASED` | OWNER rescinds after acceptance | `disbursedAmount −= amount` |

**Terminal states:** `EXPIRED`, `CANCELLED`, `RELEASED` — no further transitions permitted.

---

## Atomicity & Concurrency

### Budget gating (create reservation)

The budget constraint is enforced in a **single conditional `findOneAndUpdate`**:

```
filter: { programId, organizationId, currency,
          $expr: { $lte: [ { $add: [$reservedAmount, $disbursedAmount, amount] }, $totalBudget ] } }
update: { $inc: { reservedAmount: +amount } }
```

If MongoDB matches 0 documents, the update did not apply — budget was
insufficient.  No separate read-modify-write cycle is needed; the constraint is
self-contained in the update filter.

### Exactly-once release guarantee

Every status transition uses a conditional `findOneAndUpdate` that includes the
**current expected status** in the filter:

```
filter: { applicationId, organizationId, programId, status: <expectedStatus> }
update: { $set: { status: <nextStatus>, resolvedAt: ..., resolvedBy: ... } }
```

Concurrent requests race: the first wins (document updated), the second matches
0 documents.  The service re-reads the document to return a precise error code
rather than a generic 500.

---

## Scheduled Expiry Job

`BudgetReservationService` registers two `@Cron` jobs:

| Job | Schedule | Purpose |
|---|---|---|
| `scholarship-reservation-expiry` | Every hour | Primary expiry sweep |
| `scholarship-reservation-expiry-reconciliation` | Every 6 hours | Safety-net catch-up for missed runs |

Both jobs call `runExpiryJob()` which:
1. Finds all `PENDING` reservations with `expiresAt ≤ now` (partial index).
2. For each, issues a conditional `findOneAndUpdate` (`status = PENDING` guard).
3. If the update succeeds, decrements `BudgetLedger.reservedAmount`.
4. Skips documents already transitioned by a concurrent run.

The job is **idempotent** — running it multiple times produces the same result.

---

## API Routes

All routes are under `GET/POST/PATCH /scholarships/programs/:programId/...`  
All require `?organizationId=<id>` and a valid JWT.

### Ledger

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/scholarships/programs/:programId/budget` | OWNER | Initialise ledger (once per program) |
| `PATCH` | `/scholarships/programs/:programId/budget` | OWNER | Update total budget capacity |
| `GET` | `/scholarships/programs/:programId/budget` | OWNER, ADMIN | Get ledger summary |

### Reservations

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/scholarships/programs/:programId/applications/:applicationId/budget-reservation` | OWNER, ADMIN | Create PENDING reservation |
| `POST` | `.../budget-reservation/confirm` | OWNER, ADMIN | Confirm (applicant accepted) |
| `POST` | `.../budget-reservation/cancel` | OWNER, ADMIN | Cancel PENDING reservation |
| `POST` | `.../budget-reservation/release` | OWNER | Release CONFIRMED reservation |
| `GET` | `.../budget-reservation` | OWNER, ADMIN | Get active reservation |
| `GET` | `/scholarships/programs/:programId/budget-reservations` | OWNER, ADMIN | List all reservations |

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `RES_BUDGET_LEDGER_NOT_FOUND` | 404 | No ledger exists for this program |
| `RES_BUDGET_RESERVATION_NOT_FOUND` | 404 | Reservation not found or no active reservation |
| `BIZ_RESERVATION_ALREADY_EXISTS` | 409 | Ledger already exists / active reservation already exists for application |
| `BIZ_BUDGET_INSUFFICIENT` | 422 | Requested amount exceeds available budget |
| `BIZ_RESERVATION_INVALID_STATE` | 422 | Transition not permitted from current status |
| `BIZ_RESERVATION_ALREADY_RELEASED` | 422 | Reservation already in terminal state; release not applicable |
| `BIZ_RESERVATION_ALREADY_CONFIRMED` | 422 | CONFIRMED reservation cannot be cancelled; use release |
| `VAL_RESERVATION_INVALID_EXPIRY` | 400 | `expiresAt` is not a future date |
| `VAL_BUDGET_AMOUNT_INVALID` | 422 | `totalBudget` would fall below committed funds |

---

## Migration

Two new collections are created automatically by Mongoose on first use:

- `scholarship_budget_ledgers`
- `scholarship_budget_reservations`

No existing collections are modified.  No data migration is required.

**Indexes created at startup:**

`scholarship_budget_ledgers`
- `{ organizationId: 1 }`
- `{ programId: 1 }` (unique)
- `{ organizationId: 1, programId: 1 }`

`scholarship_budget_reservations`
- `{ organizationId: 1 }`
- `{ programId: 1 }`
- `{ applicationId: 1 }`
- `{ status: 1 }`
- `{ organizationId: 1, programId: 1, status: 1 }`
- `{ status: 1, expiresAt: 1 }` (partial — PENDING only; powers the expiry job)
- `{ applicationId: 1, status: 1 }`

---

## Privacy

Budget figures and reservation amounts are **internal financial data**.  
They must **not** be exposed to applicants via any public-facing API endpoint.  
All routes in `BudgetReservationController` are restricted to `OWNER` / `ADMIN`
roles.

---

## Operational Impact

- Two cron jobs run continuously in every application instance.  In a
  multi-instance deployment use a distributed lock (e.g. Redis `SET NX`) or a
  dedicated worker to prevent duplicate expiry processing.
- `reservedAmount` / `disbursedAmount` fields on the ledger are updated
  frequently.  Monitor for lock contention on high-volume programs.
- Historical (expired / cancelled / released) reservation documents are retained
  indefinitely for audit.  Archive to a separate collection for programs with
  large applicant pools.
