# Scholarship bounded contexts — dependency map and consolidation

Closes #1247.

Companion to [ADR 0001](../adr/0001-scholarship-bounded-contexts.md). The ADR
records *why*; this document records *what owns what* and is the reference to
consult before adding a schema, service or route in this area.

## The four contexts

| Context | Owns | Route prefix | Talks to |
| --- | --- | --- | --- |
| `src/scholarships/` | Program catalog, applications, eligibility attestations, award **acceptance**, agreements, appeals, reviews, committee decisions, budget reservations, application forms | `scholarships/*` | → `scholarship-finance` |
| `src/scholarship/` | Stellar milestone model: schedule, evidence, verification, disbursement **intent** | `organizations/:orgId/scholarships/*` | → `scholarship-finance` |
| `src/scholarship-disbursement/` | Payout wallets, Stellar assets, payment execution, batch runs, on-chain reconciliation | `organizations/:orgId/scholarships/*`, `scholarships/disbursements` | → `scholarship-finance`, Horizon |
| `src/scholarship-finance/` | Double-entry journal, balances, payout intents, receipts, refunds, recoveries, funding rounds, fees, reconciliation | `organizations/:orgId/scholarship-finance/*`, `organizations/:orgId/scholarship-programs/*` | *(nothing — the leaf)* |

## Dependency direction

```
src/scholarships ───────────────► src/scholarship-finance
src/scholarship ────────────────► src/scholarship-finance
src/scholarship-disbursement ───► src/scholarship-finance
```

Money flows **toward** `scholarship-finance`. It is the leaf: it imports nothing
from the other three. The others may consume its domain events but must not
receive synchronous calls from it.

### Aggregate ownership

| Aggregate | Owner | Notes |
| --- | --- | --- |
| Double-entry journal, balances, integrity, drift | `scholarship-finance/services/ledger.service` → `LedgerService` | **authoritative** |
| Per-program entry posting | `scholarship-finance/ledger/ledger.service` → `ProgramLedgerService` | program-scoped view of the same ledger |
| Org-level ledger / audit read view | `scholarship-finance/controllers/ledger.controller` → `FinanceLedgerController` | |
| Per-program entry read view | `scholarship-finance/ledger/ledger.controller` → `ProgramLedgerController` | |
| Payout intent (durable execution record) | `scholarship-finance/payouts/payout-intent.schema` → `PayoutIntent` | |
| Disbursement intent (pre-execution) | `scholarship/disbursement-intent.schema` → `DisbursementIntent` | becomes a `PayoutIntent` |
| Payment execution | `scholarship-disbursement/scholarship-payment.schema` → `ScholarshipPayment` | |
| Award acceptance lifecycle | `scholarships/scholarship-award.schema` → `ScholarshipAward` | |
| Stellar milestone award | `scholarship/scholarship-award.schema` → `ScholarshipAward` | **name collision — see below** |
| Program catalog | `scholarships/scholarship-program.schema` → `ScholarshipProgram` | |
| Program treasury view | `scholarship-finance/programs/scholarship-program.schema` → `ScholarshipProgram` | **name collision — see below** |
| Funding rounds, deposits, allocations | `scholarship-finance/schemas/funding-round.schema`, `sponsor-deposit.schema`, `allocation-change.schema` | |
| Refunds | `scholarship-finance/schemas/refund.schema` → `Refund` | |
| Recoveries | `scholarship-finance/schemas/recovery-claim.schema`, `recovery-collection.schema` | |
| Fees | `scholarship-finance/schemas/fee-schedule.schema` → `FeeSchedule` | |
| Receipts | `scholarship-finance/receipts/payment-receipt.schema` → `PaymentReceipt` | |

## What was consolidated

### 1. `scholarship-finance.module.ts` — repaired

The file was the product of a bad merge and did not compile:

- an unterminated block comment at line 52 swallowed ~50 lines of imports;
- `ScholarshipFinanceJobs` and `LedgerController` were each imported **twice**;
- `LedgerService` was imported from two different modules under one name;
- the `@Module` decorator had duplicate `controllers`, `providers` and `exports`
  keys, and a second `MongooseModule.forFeature([...])` had lost its `imports:`
  key and floated as a bare expression.

It is now a single coherent module: all imports at the top, one `imports` array
(`IdempotencyModule` + one `MongooseModule.forFeature` with all 18 schemas), one
`controllers` array (14), one `providers` array (19), one `exports` array (6).

### 2. Duplicate class names — disambiguated

Two pairs of same-named classes made the module uncompilable and left ownership
ambiguous. Renamed so each name is unique and states its scope:

| Before | After |
| --- | --- |
| `ledger/ledger.service` → `LedgerService` | → `ProgramLedgerService` |
| `controllers/ledger.controller` → `LedgerController` | → `FinanceLedgerController` |
| `ledger/ledger.controller` → `LedgerController` | → `ProgramLedgerController` |
| `jobs/scholarship-finance.jobs` → `ScholarshipFinanceJobs` (scheduler half) | → `ScholarshipFinanceSchedulers` |

`services/ledger.service` keeps the name `LedgerService` because it is the
authoritative double-entry journal aggregate.

### 3. `scholarship-finance.jobs.ts` — split by lifecycle

The file declared `ScholarshipFinanceJobs` twice, with an orphaned import block
between them. Now:

- `ScholarshipFinanceJobs` (`OnModuleInit`/`OnModuleDestroy`) — periodic
  maintenance: close expired funding rounds, recompute balances and flag drift,
  reconcile recovery claims. Emits `SCHOLARSHIP_LEDGER_DRIFT_DETECTED`; **never
  posts corrective entries**.
- `ScholarshipFinanceSchedulers` (`OnApplicationBootstrap`/`OnApplicationShutdown`)
  — in-process schedulers: per-program reconciliation and payout-recovery
  retries.

## Known collisions that are documented, not silently resolved

These are real and need a decision that cannot be made from the code alone.

### `scholarship_awards`

| Schema | Lifecycle |
| --- | --- |
| `src/scholarships/schemas/scholarship-award.schema.ts` | `PENDING_ACCEPTANCE → ACCEPTED / DECLINED / OFFER_EXPIRED / RESCINDED` |
| `src/scholarship/schemas/scholarship-award.schema.ts` | `ACTIVE → CANCELLED` |

Both target the collection `scholarship_awards`. They cannot both be right.
**Ownership is documented** — `scholarships` owns the acceptance lifecycle,
`scholarship` owns the Stellar milestone award — but picking a single winner
requires knowing which is live in production, and that needs a data migration.

### `scholarship_programs`

| Schema | Fields |
| --- | --- |
| `src/scholarships/schemas/scholarship-program.schema.ts` | `title`, `description`, `formFields`, `statusHistory`, `currentTermsVersionId` |
| `src/scholarship-finance/programs/scholarship-program.schema.ts` | `name`, `asset`, `network`, `treasuryAccount`, `externalBalanceSource`, `ledgerLock` |

Both target `scholarship_programs`. The first is the **catalog** view, the
second the **treasury** view. They are deliberately separate projections of the
same program, but the split must be honoured: catalog fields are owned by
`scholarships`, treasury fields by `scholarship-finance`.

### `scholarship_ledger_entries`

`scholarship-finance/ledger/ledger-entry.schema.ts` (`LedgerEntry`) and
`scholarship-disbursement/schemas/disbursement-ledger-entry.schema.ts`
(`DisbursementLedgerEntry`) both target this collection. `LedgerEntry` is the
double-entry posting; `DisbursementLedgerEntry` records a payment finalisation
or reversal against a `paymentId`/`txHash`. The boundary is: **finance owns the
entry, disbursement owns the payment that caused it.**

## Circular-dependency guard

`src/__tests__/scholarship-context-acyclicity.spec.ts` statically asserts the
dependency direction above. It parses the import graph of the four context
directories and fails if any of them imports from `scholarship-finance`, or if
the graph contains a cycle. This is the regression guard for the ADR's central
rule.

## Migration

No data migration is required by the changes in this document — the renames are
compile-time only and the module rewrite changes no runtime behaviour.

The `scholarship_awards` collision **does** need a migration, but only once a
winner is chosen. Until then both schemas remain and the ownership documented
above is the source of truth.

Existing IDs are preserved: no schema changes its `_id`, its collection name, or
the shape of already-written documents.

## Operational impact

- `scholarship-finance` now registers 18 schemas and 14 controllers. Boot time
  is unaffected in practice (Mongoose compiles models lazily per connection),
  but the module is large; if it ever needs splitting, the seam is the aggregate
  table above.
- Two job classes run on different lifetimes. Disabling one does not disable the
  other: `SCHOLARSHIP_FINANCE_JOBS_ENABLED` controls the maintenance sweep,
  `SCHOLARSHIP_RECONCILIATION_INTERVAL_MS` / `SCHOLARSHIP_PAYOUT_RETRY_INTERVAL_MS`
  control the schedulers (0 disables).
- The finance module emits `SCHOLARSHIP_LEDGER_DRIFT_DETECTED` on drift. That
  event is the integration point for the other three contexts; they must not
  poll the ledger directly.
