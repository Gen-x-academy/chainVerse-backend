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
