# ADR 0001 — Scholarship bounded contexts: one owner per aggregate

- Status: Accepted
- Date: 2026-09-27
- Deciders: akargi
- Issues: #1247

## Context

Four directories under `src/` each model "scholarship money":

| Directory | Files | Concern |
| --- | --- | --- |
| `src/scholarships/` | ~69 | Program catalog, applications, eligibility, awards with an acceptance lifecycle, agreements, appeals, reviews, committee decisions, budget reservations |
| `src/scholarship/` | ~33 | Stellar-native awards, milestone schedules/evidence/verification, disbursement intents |
| `src/scholarship-disbursement/` | ~29 | Payout wallets, Stellar assets, scheduled payments, batch execution, on-chain reconciliation |
| `src/scholarship-finance/` | ~69 | Per-program double-entry ledgers, payout intents with failure recovery, receipts, reconciliation, funding rounds, fees, refunds, recoveries |

They overlap enough to be actively harmful. Concretely, on `main` at the time of
writing:

1. **Collection name collisions.** Two different `ScholarshipAward` schemas both
   target the collection `scholarship_awards`, with incompatible lifecycles
   (`PENDING_ACCEPTANCE/ACCEPTED/DECLINED/OFFER_EXPIRED/RESCINDED` vs
   `ACTIVE/CANCELLED`). Two different `ScholarshipProgram` schemas both target
   `scholarship_programs` with almost disjoint field sets. Two different ledger
   schemas both target `scholarship_ledger_entries`.
2. **Duplicate class names in one module.** `scholarship-finance` had two
   `LedgerService` classes and two `LedgerController` classes, and its module
   file imported both under the same local name — a duplicate-identifier compile
   error. It also carried duplicate `@Module` keys (`controllers`, `providers`,
   `exports`) and an unterminated block comment that swallowed ~50 lines of
   imports.
3. **Two competing reconciliation jobs.** `scholarship-disbursement` and
   `scholarship-finance` each run a scheduled reconciliation loop.
4. **Two double-entry models in the same module.** `LedgerJournal`
   (`idempotencyKey` + `sourceType`/`sourceId`) and `LedgerEntry` (`reference` +
   `entryType`) both model balanced journal entries with `lines[]`.
5. **No documented ownership.** Nothing stated which directory is authoritative
   for "an award", "a payment" or "a ledger entry", so every new feature had to
   guess.

## Decision

### 1. The treasury aggregate is owned by `scholarship-finance`

`scholarship-finance` is the system of record for money movement: the
double-entry journal, account balances, payout intents, receipts, refunds and
recoveries. Its `LedgerService` (`services/ledger.service.ts`) is the
authoritative ledger aggregate.

The per-program entry view (`ledger/`) is renamed to make the relationship
explicit rather than leaving two same-named services:

| Before | After | Role |
| --- | --- | --- |
| `services/ledger.service` → `LedgerService` | unchanged | **authoritative** double-entry journal, balances, integrity, drift |
| `ledger/ledger.service` → `LedgerService` | → `ProgramLedgerService` | per-program entry posting (narrower, program-scoped) |
| `controllers/ledger.controller` → `LedgerController` | → `FinanceLedgerController` | org-level ledger / audit read view |
| `ledger/ledger.controller` → `LedgerController` | → `ProgramLedgerController` | per-program entry read view |

### 2. The two job classes are separated by lifecycle

`scholarship-finance.jobs.ts` declared `ScholarshipFinanceJobs` **twice**. They
are now distinct:

- `ScholarshipFinanceJobs` — periodic *maintenance* sweep (`OnModuleInit`):
  close expired funding rounds, recompute ledger balances and flag drift,
  reconcile recovery claims. Emits domain events; **never posts corrective
  entries**.
- `ScholarshipFinanceSchedulers` — in-process *schedulers*
  (`OnApplicationBootstrap`): per-program reconciliation and payout-recovery
  retries.

They stay separate because they run on different lifecycles and depend on
different services; merging them would couple unrelated concerns.

### 3. `scholarships` owns the application lifecycle

`src/scholarships/` remains authoritative for the *candidate-facing* lifecycle:
program catalog, applications, eligibility attestations, award **acceptance**,
agreements, appeals, reviews, committee decisions, budget reservations.

The distinction that matters: `scholarships` decides **who gets offered money
and on what terms**; `scholarship-finance` decides **how money moves**. Award
*acceptance* lives in `scholarships`; the resulting *payout* lives in
`scholarship-finance`.

### 4. `scholarship` owns the milestone schedule

`src/scholarship/` keeps the Stellar milestone model (schedule → evidence →
verification → disbursement intent). Its `DisbursementIntent` is an *intent*;
the durable execution record is `scholarship-finance`'s `PayoutIntent`.

### 5. `scholarship-disbursement` owns chain execution

`src/scholarship-disbursement/` keeps wallets, assets, payment execution and
on-chain reconciliation. It is the only context allowed to talk to Horizon.

### 6. Duplicates are deleted, not aliased

Where two schemas target one collection with incompatible models, the duplicate
is **removed** and its consumers are repointed, rather than being kept as a
deprecated alias. An alias keeps the ambiguity alive indefinitely; a deletion
forces every consumer to be updated in the same change, which is the only
point at which the ambiguity can actually be resolved.

## Consequences

### Dependency direction (the rule that must not be violated)

```
scholarships ──────────────► scholarship-finance        (award → payout intent)
scholarship ───────────────► scholarship-finance        (milestone → payout intent)
scholarship-disbursement ──► scholarship-finance        (payment → ledger entry)
```

Money flows **toward** `scholarship-finance`, which is therefore a leaf in this
graph: nothing in `scholarship-finance` imports from the other three. The finance
module may emit domain events that the others consume, but it never calls back
into them.

`scholarship-context-acyclicity.spec.ts` enforces this statically, and enforces
the companion rule that the graph stays acyclic — a cycle, or a back-edge into
finance, reintroduces exactly the ambiguity this ADR removes, and is invisible at
runtime because Nest will wire a circular module graph as long as the classes
resolve.

### Shared kernels

`src/scholarship-outbox/` (#1255) is **not** a fifth context. It owns no
scholarship aggregate; it holds the transaction runner, the transactional outbox
schema and relay that make award approval, reservation consumption, milestone
approval and intent creation atomic across collections. Both `scholarships` and
`scholarship` import it.

The rule that keeps this from becoming a back-door into finance: a shared kernel
may import shared infrastructure (`common/`, `events/`, Nest packages) and must
not import any of the four contexts. The same spec asserts that, so the kernel
cannot be used to reach `scholarship-finance` without some context declaring the
dependency it actually has.

### What this costs

- Four renames (`LedgerService` → `ProgramLedgerService`,
  `LedgerController` → `FinanceLedgerController` / `ProgramLedgerController`,
  `ScholarshipFinanceJobs` → `ScholarshipFinanceSchedulers` for the scheduler
  half) and a rewrite of the finance module file.
- The two `scholarship_awards` schemas cannot both be right; whichever is kept,
  the other's consumers must be migrated. **This is the one decision here that
  needs a data migration, and it is deliberately left as an explicit follow-up
  rather than guessed at** — see "Open items".

### Open items

1. **The `scholarship_awards` collision is not silently resolved.** The two
   schemas model incompatible lifecycles. Picking a winner requires knowing
   which is live in production. Until then, both schemas remain but the
   *ownership* is documented: `scholarships` owns acceptance,
   `scholarship` owns the Stellar milestone award. See
   `docs/scholarships/scholarship-finance-consolidation.md`.
2. **`LedgerJournal` vs `LedgerEntry`** — two double-entry models in one module.
   `LedgerJournal` is the posting record (`idempotencyKey`, `sourceType`);
   `LedgerEntry` is the immutable posted entry (`reference`, `entryType`). They
   are kept separate on purpose (posting vs posted), but the boundary must be
   documented so a third model does not appear.

## Alternatives considered

**Keep four contexts, add a facade.** Rejected: a facade over four owners still
leaves four owners, and the next contributor has to learn the facade *and* the
four owners.

**Merge all four into one `scholarships` module.** Rejected: ~200 files in one
module makes the ownership problem worse, not better — the aggregates would still
overlap, just inside a single file.

**Rename the collection targets instead of the classes.** Rejected: renaming a
Mongo collection is a data migration with downtime, whereas the class renames
are compile-time and free.
