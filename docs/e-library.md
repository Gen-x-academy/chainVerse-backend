# E-Library: Charges & Overdue

Implements the Charges/Payment Ledger, Waiver/Adjustment Workflow, Overdue
Scheduler, and Fine Calculation Engine (issues #1033–#1036). Module code:
`src/e-library/`. Registered in `src/app.module.ts` as `ELibraryModule`.

Loan checkout/return is included as a minimal supporting surface (no book
catalog) since the ledger and overdue scheduler need loans to operate on;
full circulation/catalog management is out of scope for this deliverable.

## Roles

Reuses the existing `Role` enum (`admin`, `moderator`, `tutor`, `student`) —
there is no dedicated `librarian` role. `moderator` is treated as library
staff/librarian for the purposes of this module; `admin` has full staff
permissions plus approval authority over large waivers.

## Money model

- All amounts are integers in **minor currency units** (e.g. cents). No
  floats are used anywhere in the charge/ledger/fine path.
- Currency is always an explicit 3-letter ISO 4217 code on every DTO and
  every `LedgerEntry`/`ChargePolicy`. Balances are scoped per
  `(patronId, currency)`.
- `LedgerEntry` (`src/e-library/schemas/ledger-entry.schema.ts`) is
  **append-only**: the schema registers `pre` hooks on `updateOne`,
  `updateMany`, `findOneAndUpdate`, `deleteOne`, `deleteMany`, and
  `findOneAndDelete` that throw, and no service/controller path ever calls
  those. Corrections are made by posting a new entry with
  `referenceEntryId` pointing at the entry being corrected (waiver, refund,
  adjustment) — never by mutating the original.
- `PatronBalance` is a materialized cache for fast reads/atomic increments
  only. It is always reconcilable from the `LedgerEntry` stream via
  `LedgerService.reconcileBalance()` (`POST
  /e-library/ledger/patrons/:patronId/reconcile`, admin only), which
  recomputes the balance by summing entries and corrects the cache if it
  has drifted.

## Fine calculation engine (#1034)

`FineCalculationService.calculate(loan, policy, asOf)` is a pure function:
same inputs always produce the same output, and it never reads ambient
state (no `Date.now()` inside it — callers pass `asOf` explicitly).

`ChargePolicy` documents are versioned and time-bounded
(`effectiveFrom`/`effectiveTo`). Creating a new policy via `POST
/e-library/charge-policies` automatically closes any currently open-ended
policy of the same `chargeType` + `currency` at the new policy's
`effectiveFrom`. Because charges store the policy id/snapshot they were
computed with (see `LedgerEntry.metadata.policyId`) at the time they were
posted, **later policy changes never rewrite past charges** — they only
affect what gets calculated going forward.

Preview a fine without posting anything: `GET
/e-library/fines/loans/:loanId/preview?asOf=&currency=`.

## Overdue scheduler (#1033)

`OverdueSchedulerService` runs two cron jobs (`@nestjs/schedule`):

- Every hour: transitions `ACTIVE` loans whose `dueDate` has passed into
  `OVERDUE`, and posts the resulting fine via the calculation engine.
- Every 6 hours: a reconciliation pass that re-runs the exact same
  idempotent query, as a safety net for missed/failed hourly runs.

Guarantees:
- **Timezone-safe**: `dueDate` is stored and compared as an absolute UTC
  `Date` instant, never as a calendar-date string compared in server-local
  time.
- **Restart-safe / idempotent**: each loan is claimed with
  `findOneAndUpdate({ _id, status: ACTIVE }, { status: OVERDUE })`. If the
  process crashes mid-run, a restart just re-queries remaining `ACTIVE` +
  overdue loans — nothing is double-processed or skipped.
- **Bounded**: capped at `E_LIBRARY_OVERDUE_JOB_MAX_BATCHES` batches of
  `E_LIBRARY_OVERDUE_JOB_BATCH_SIZE` loans per run (defaults 20 × 500).
- **Observable**: every run writes a `SchedulerJobRun` document
  (scanned/transitioned/error counts, status, timing). View history via
  `GET /e-library/overdue/runs` (admin only); manually trigger a run via
  `POST /e-library/overdue/run` (e.g. after downtime).
- **Never marks returned loans overdue**: the transition query only ever
  matches `status: ACTIVE`, which excludes `RETURNED` loans by
  construction.

**Operational note**: an effective `OVERDUE_FINE` policy must exist for
`E_LIBRARY_DEFAULT_CURRENCY` (default `USD`) before loans go overdue in
production. If none exists, the loan still transitions to `OVERDUE`
correctly, but the fine-posting step fails and is logged as a scheduler
error (`SchedulerJobRun.errorCount` / logs) — it is not silently dropped.
Create the policy first via `POST /e-library/charge-policies`.

## Waiver & adjustment workflow (#1036)

`POST /e-library/waivers` (moderator/admin) requests a waiver (reduces a
charge, bounded by the amount remaining on it) or an adjustment (increases
a charge, e.g. to correct an undercharged fine) against an existing charge
`LedgerEntry`. Both take a positive magnitude in the request; the ledger
entry's sign is derived from `entryType`, not supplied by the caller. If
the requested amount is within the requesting role's auto-approval
threshold, it is applied immediately; otherwise it is queued as
`pending_approval`.

- Thresholds: `E_LIBRARY_MODERATOR_WAIVER_AUTO_LIMIT` (default 2000 minor
  units) and `E_LIBRARY_ADMIN_WAIVER_AUTO_LIMIT` (default 20000).
- Large waivers require approval: `POST /e-library/waivers/:id/decide`
  (admin only) approves or rejects a pending request.
- Maker-checker: the actor who requested a waiver cannot also approve it
  (`BIZ_WAIVER_SELF_APPROVAL`).
- A waiver can never exceed the remaining un-waived amount of the original
  charge (`BIZ_WAIVER_EXCEEDS_CHARGE`).
- Every decision records actor, reason, and the account balance
  immediately before and after the resulting ledger entry, on both the
  `WaiverRequest` document and the `LedgerEntry` itself
  (`balanceBeforeMinorUnits`/`balanceAfterMinorUnits`).

## Idempotency

`POST /e-library/ledger/charges` and `POST /e-library/ledger/payments` are
decorated with `@Idempotent()` from the existing `IdempotencyModule` —
callers must send an `X-Idempotency-Key` header; a retried request with the
same key replays the original response instead of double-posting.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `E_LIBRARY_MODERATOR_WAIVER_AUTO_LIMIT` | `2000` | Moderator auto-approval ceiling, minor units |
| `E_LIBRARY_ADMIN_WAIVER_AUTO_LIMIT` | `20000` | Admin auto-approval ceiling, minor units |
| `E_LIBRARY_OVERDUE_JOB_BATCH_SIZE` | `500` | Loans scanned per batch per scheduler run |
| `E_LIBRARY_OVERDUE_JOB_MAX_BATCHES` | `20` | Max batches per scheduler run |
| `E_LIBRARY_DEFAULT_CURRENCY` | `USD` | Currency used to price auto-generated overdue fines |

## Swagger

All endpoints are documented under the `E-Library *` tags in the Swagger UI
(`/api`, non-production only), each requiring bearer auth
(`@ApiBearerAuth('access-token')`).

---

## Stellar Charge Payments (#1037)

Lets patrons settle eligible library charges using the existing Stellar
payment verification infrastructure (`StellarService.verifyPayment`).

### Flow

1. The patron constructs a Stellar transaction on their own wallet and
   submits the transaction hash alongside the charge ID via
   `POST /e-library/charges/pay`.
2. The service resolves the charge `LedgerEntry` and validates:
   - The entry is a chargeable type (`OVERDUE_FINE`, `LOST_ITEM_FEE`,
     `REPLACEMENT_COST_FEE`, `DAMAGE_FEE`).
   - The payment currency matches the charge currency.
   - The payment amount does not exceed the charge amount.
   - The transaction hash has not already been applied to any charge
     (`BIZ_PAYMENT_ALREADY_APPLIED`).
3. The Stellar transaction is verified on-chain via `StellarService`.
4. On successful verification, a `PAYMENT` `LedgerEntry` (negative amount)
   is posted referencing the original charge.
5. A `LibraryChargePayment` document is persisted regardless of verification
   outcome, providing a full audit trail.

### Idempotency / Replay protection

A `LibraryChargePayment` document has a compound unique index on
`(chargeEntryId, transactionHash)`. Submitting the same hash for the same
charge twice returns the cached result without re-verifying or double-posting.
Submitting the same hash for a *different* charge raises
`BIZ_PAYMENT_ALREADY_APPLIED` (409 Conflict).

### Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/e-library/charges/pay` | STUDENT, TUTOR, MODERATOR, ADMIN | Settle a charge. Requires `X-Idempotency-Key` header. |
| GET | `/e-library/charges/payments/:patronId` | All auth | List payment records for a patron. Students/tutors see only their own. |
| GET | `/e-library/charges/payment/:id` | MODERATOR, ADMIN | Get a single payment record. |

### Schema

`LibraryChargePayment` (`src/e-library/schemas/library-charge-payment.schema.ts`)
fields: `patronId`, `chargeEntryId`, `asset`, `amountMinorUnits`, `currency`,
`destination`, `memo`, `transactionHash`, `verified`, `ledgerEntryId`,
`submittedBy`.

### Operational note

A payment that Stellar rejects (`verified: false`) is persisted without
posting a ledger entry. Staff can identify failed payments by querying
`GET /e-library/charges/payments/:patronId` and filtering on `verified: false`.

---

## Lost-Item Declaration & Replacement-Cost Workflow (#1038)

Allows staff or policy to mark severely overdue copies lost and assess
replacement and processing costs.

### Declaration flow

1. Staff call `POST /e-library/lost-items` with the loan ID and fees.
2. The service validates:
   - The loan exists and is not already RETURNED.
   - No existing `LostItem` record exists for this loan.
3. Side effects on declaration:
   - `Loan.copyStatus` → `LOST`.
   - `BookCopy.status` → `LOST`.
   - Any active hold on that copy is cancelled.
   - `LOST_ITEM_FEE` (processing, **non-refundable**) posted to ledger.
   - `REPLACEMENT_COST_FEE` (item price, **refundable on return**) posted.
   - A `LostItem` document is created as audit trail.

### Late-return flow

1. Staff call `POST /e-library/lost-items/:id/return`.
2. The service validates the record is in `DECLARED` status.
3. Side effects:
   - `REPLACEMENT_COST_REVERSAL` compensating ledger entry is posted
     (negative amount, references the original `REPLACEMENT_COST_FEE`
     entry via `referenceEntryId`).
   - `BookCopy.status` → `AVAILABLE`.
   - `LostItem.status` → `RETURNED`.
4. The `LOST_ITEM_FEE` is **always retained** per policy.

### Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/e-library/lost-items` | MODERATOR, LIBRARIAN, ADMIN | Declare a copy lost. |
| POST | `/e-library/lost-items/:id/return` | MODERATOR, LIBRARIAN, ADMIN | Process late return. |
| GET | `/e-library/lost-items/:id` | MODERATOR, LIBRARIAN, ADMIN | Get record by ID. |
| GET | `/e-library/lost-items/patron/:patronId` | All auth | List for patron. Students/tutors see own records only. |

### Schema

`LostItem` (`src/e-library/schemas/lost-item.schema.ts`): `patronId`,
`copyId`, `loanId` (unique), `status`, `processingFeeMinorUnits`,
`replacementCostMinorUnits`, `currency`, `processingFeeEntryId`,
`replacementCostEntryId`, `reversalEntryId`, `declaredBy`,
`declarationNote`, `returnedAt`, `returnProcessedBy`.

### LedgerEntry types added

| Type | Sign | Description |
|------|------|-------------|
| `REPLACEMENT_COST_FEE` | + | Replacement cost charge |
| `REPLACEMENT_COST_REVERSAL` | - | Compensating reversal on late return |

---

## Borrowing Suspension Thresholds (#1039)

Blocks new circulation (checkout/holds) when any of three policy-derived
thresholds is crossed. Returns and account access are always permitted.

### Thresholds

| Dimension | Variable | Default | Description |
|-----------|----------|---------|-------------|
| Overdue count | `E_LIBRARY_SUSPENSION_OVERDUE_COUNT` | `3` | Number of concurrent OVERDUE loans |
| Overdue age (days) | `E_LIBRARY_SUSPENSION_OVERDUE_AGE_DAYS` | `30` | Age of the oldest overdue item |
| Unpaid balance | `E_LIBRARY_SUSPENSION_UNPAID_BALANCE` | `5000` | Outstanding balance in `E_LIBRARY_DEFAULT_CURRENCY` minor units |

### Suspension lifecycle

1. **Threshold breach** — `BorrowingSuspensionService.reconcile(patronId)`
   is called (or the scheduler calls it). If any threshold is exceeded a
   `BorrowingSuspension` document is created and `PatronProfile.status` →
   `SUSPENDED`.
2. **Auto-lift** — After a return or payment, `reconcile()` is called again.
   If all thresholds are back below their limits, the suspension record
   transitions to `LIFTED_AUTO` and `PatronProfile.status` → `ACTIVE`.
3. **Staff exception** — `POST /e-library/suspensions/:id/lift` lifts the
   suspension as an authorized override. Maker-checker rule: the staff
   member who created the suspension cannot also lift it.

### Remediation

Every suspension record carries a `message` field that explains:
- Which threshold was exceeded.
- What the measured value and threshold are.
- What the patron must do to restore access.

### Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/e-library/suspensions/patron/:patronId/check` | MOD, LIB, ADMIN | Read-only threshold check (no state change). |
| POST | `/e-library/suspensions/patron/:patronId/reconcile` | MOD, LIB, ADMIN | Trigger reconciliation — apply or lift. |
| POST | `/e-library/suspensions` | MOD, LIB, ADMIN | Manual (staff-initiated) suspension. |
| POST | `/e-library/suspensions/:id/lift` | MOD, LIB, ADMIN | Lift as exception (maker-checker enforced). |
| GET | `/e-library/suspensions/patron/:patronId` | All auth | List history. Students/tutors see own records. |
| GET | `/e-library/suspensions/patron/:patronId/active` | All auth | Get the currently active suspension (null if none). |

### Schema

`BorrowingSuspension` (`src/e-library/schemas/borrowing-suspension.schema.ts`):
`patronId`, `status`, `reason`, `message`, `thresholdSnapshot`, `autoLift`,
`suspendedUntil`, `createdBy`, `liftedBy`, `liftNote`, `liftedAt`.

### Environment variables added

| Variable | Default | Purpose |
|----------|---------|---------|
| `E_LIBRARY_SUSPENSION_OVERDUE_COUNT` | `3` | Overdue count threshold |
| `E_LIBRARY_SUSPENSION_OVERDUE_AGE_DAYS` | `30` | Overdue age threshold (days) |
| `E_LIBRARY_SUSPENSION_UNPAID_BALANCE` | `5000` | Unpaid balance threshold (minor units) |
