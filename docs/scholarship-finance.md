# Scholarship Finance

Covers issues #1166 (sponsor deposits & funding rounds), #1167 (transparent fees), #1168 (refunds & returned payments) and #1169 (recoveries & clawbacks).

Code: `src/scholarship-finance/`. Swagger tags: `Scholarship Finance — *` (available at `/api` outside production).

---

## 1. Design overview

Every money movement posts to one **append-only, double-entry ledger** scoped per organization (tenant) and per asset.

| Concept | Where | Notes |
| --- | --- | --- |
| Journal | `scholarship_ledger_journals` | Balanced lines; unique `idempotencyKey` per business event; never updated except the `reversedBy` pointer |
| Balance | `scholarship_ledger_balances` | Materialized running balance per `(organizationId, account, assetKey)`, updated with guarded atomic `$inc` |
| Audit | `scholarship_finance_audit` | Every state change: actor, reason, details |

### Chart of accounts

| Account | Side | Meaning |
| --- | --- | --- |
| `asset:custody` | debit | Funds held for the tenant (wallet / bank) |
| `liability:fund:program:<programId>` | credit | Sponsor funds restricted to a program |
| `liability:fund:pool` | credit | Unrestricted scholarship pool |
| `revenue:platform_fee` | credit | Platform fee revenue, **separate from sponsor funds** |
| `liability:network_fee_payable` | credit | Network / rail fees owed to third parties |
| `liability:refund_payable` | credit | Approved refunds awaiting payout |
| `asset:recovery_receivable` | debit | Amounts owed under open recovery claims |
| `contra:recovery_pending` | credit | Memo offset to the receivable until cash is collected |

**Solvency:** no account can go below zero. Postings that would do so fail with `422 BIZ_INSUFFICIENT_FUNDS` before anything is written.

**Amounts:** always integer **minor units** (stroops, cents). Fractions are rejected, not rounded. Fee math uses BigInt.

**Assets:** `{ code, issuer }`, normalized to `assetKey` = `CODE:ISSUER` or `CODE:native`.

---

## 2. Ownership & authorization

- **Owning team:** Scholarships Backend / Finance.
- **Tenant boundary:** all routes live under `/organizations/:organizationId/scholarship-finance/...`. `FinanceAccessGuard` resolves the caller's permissions for *that* organization, and every query filters by that `organizationId`. A record from another tenant returns 404.
- **Roles** (stored in `OrganizationMember.role`):

| Member role | Permissions |
| --- | --- |
| `finance_viewer` | `finance:view` |
| `finance_operator` | view + `finance:operate` |
| `finance_approver` | view + operate + `finance:approve` |
| Platform `admin` (JWT role) | all permissions, all tenants |

- **Separation of duties:** separate people must handle these steps (`422 BIZ_SEPARATION_OF_DUTIES`):
  - the refund requester and the refund approver
  - the recovery claim author and its approver
  - for `manual`-rail deposits, the person who recorded the deposit and the person who credits it

---

## 3. Sponsor deposits & funding rounds (#1166)

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/funding-rounds` | operate |
| GET | `/funding-rounds`, `/funding-rounds/:id` | view |
| POST | `/funding-rounds/:id/close` `{reason}` | approve |
| POST | `/deposits` | operate |
| GET | `/deposits`, `/deposits/:id` | view |
| POST | `/deposits/:id/credit` | approve |
| POST | `/deposits/:id/reject` `{reason}` | approve |
| POST | `/allocation-changes` (requires `X-Idempotency-Key`) | approve |
| GET | `/allocation-changes` | view |

Guarantees:
- **Deposits bind asset and source.** Recording a deposit fixes the asset, the rail and the rail reference (e.g. a Stellar tx hash). A deposit made against a round must use the round's asset (`BIZ_ASSET_MISMATCH`) and goes to the round's allocation.
- **A deposit is never credited twice**, for three reasons:
  1. A unique index on `(source.rail, source.reference, assetKey)` applies across all tenants, so the same transfer can't be recorded twice (`409 BIZ_DEPOSIT_ALREADY_RECORDED`).
  2. Crediting claims the `pending → credited` transition atomically.
  3. The credit journal key is `deposit-credit:<depositId>`.
- **Allocation changes are authorized and auditable.** Only approvers can move funds, and a reason is required. Each move writes an `AllocationChange` record, a journal and an audit event. A move can't take more than the source fund holds.
- **Round closing:** an approver can close a round manually, and the background job closes rounds whose window has ended.

## 4. Fees (#1167)

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/fee-schedules` | approve |
| GET | `/fee-schedules?assetKey=` | view |
| POST | `/fee-schedules/preview` | view |

- **Versioned basis and rounding:**
  - Schedules can't be changed once published. Each one is versioned per tenant and asset, and records its `rounding` (`half_up`, `half_even`, `floor` or `ceil`) and its rules.
  - A rule has a kind (`platform` / `network`), an event, basis points, a fixed fee, and an optional min and max.
  - `effectiveFrom` can't be in the past, so fees never apply retroactively.
- **Every credited deposit records the fees applied:** `fee.feeScheduleId`, `feeScheduleVersion`, the rounding mode and a per-rule breakdown. Fees come from the schedule in force at `receivedAt`.
- **Recipient amounts are never reduced unexpectedly:**
  - For **deposits**, fees are *inclusive*: the program receives `net = gross − fees`, and the preview shows this in advance. If fees would take the whole deposit, the credit is rejected (`BIZ_FEE_EXCEEDS_AMOUNT`) instead of the program silently receiving 0.
  - For **disbursements**, fees are *exclusive*: the recipient receives exactly the requested amount and the program pays `gross = amount + fees`. `FeeService` is exported so the future disbursement module can use the same calculation.
- **Fee revenue is accounted for separately.** Platform fees are credited to `revenue:platform_fee`, and network fees to `liability:network_fee_payable`, never to a fund.
- If no schedule is configured for an asset, fees are zero and the deposit records `feeScheduleVersion: null`.

## 5. Refunds & returned payments (#1168)

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/refunds` | operate |
| GET | `/refunds`, `/refunds/:id` | view |
| POST | `/refunds/:id/approve` | approve (not the requester) |
| POST | `/refunds/:id/complete` `{payoutReference}` | approve |
| POST | `/refunds/:id/reject` `{reason}` | approve |
| POST | `/refunds/:id/cancel` `{reason}` | operate |

| Type | Use | Ledger on approve | Ledger on complete |
| --- | --- | --- | --- |
| `rejected_transfer` | The rail bounced the sponsor's transfer | Full **reversal** of the original credit journal, fees included | none (records the rail return reference) |
| `sponsor_refund` | Sponsor asks for money back | fund → refund payable | refund payable → custody |
| `overpayment` | Sponsor sent too much | fund → refund payable | refund payable → custody |
| `unused_balance` | Money left in a program after its round closed | fund → refund payable | refund payable → custody |

- **Refund authority is restricted.** Only approvers can approve, complete or reject a refund, and the approver can't be the requester.
- **Liabilities stay solvent:**
  - Requests are checked against what is still refundable on the deposit (`net − refunded − pending`).
  - Approval re-checks the deposit atomically, and the ledger guard re-checks the fund. If the credited money has already been moved or spent, approval fails.
- **Original entries are reversed, never deleted:**
  - A rejected transfer posts a mirror journal with `reversalOf` set.
  - Rejecting an already-approved refund posts a reversal of its reservation journal.
  - The deposit status tracks all of this (`partially_refunded`, `refunded` or `reversed`).

## 6. Recoveries & clawbacks (#1169)

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/recoveries` | operate |
| GET | `/recoveries`, `/recoveries/:id`, `/recoveries/:id/collections` | view |
| GET | `/recoveries/reconciliation` | view |
| POST | `/recoveries/:id/approve` | approve (not the author) |
| POST | `/recoveries/:id/collections` | operate |
| POST | `/recoveries/:id/write-off` `{reason}` | approve |
| POST | `/recoveries/:id/cancel` `{reason}` | operate for drafts, approve for open claims |

- **Reason and legal basis are required.** Each claim records a `reason` (`fraud`, `withdrawal` or `milestone_failure`) and a `legalBasis` (`{policyReference, clause, description}`). Evidence is stored as references only.
- **No wallet is ever debited silently:**
  - A claim can only be collected once it has been approved by a second person. Approval sets `noticeIssuedAt` and emits `scholarship-finance.recovery.opened`, which a notification listener should turn into the recipient notice.
  - The collection methods are `voluntary_repayment`, `manual_transfer` and `award_offset` (which requires `recipientConsentRef`). **By design, there is no wallet-debit method.**
  - A collection only records money that has already been received. It needs an `externalReference` that is unique per tenant, and the journal key is derived from that reference, so the same receipt can't be counted twice.
- **Collected amounts reconcile to open claims:**
  - Collections can never exceed `claimed − collected − writtenOff`.
  - `GET /recoveries/reconciliation` checks the following for each asset:
    1. The total outstanding on open claims equals the ledger `recovery_receivable`, which equals the ledger `recovery_pending` contra.
    2. `collectedMinor` summed across claims equals the total of the collection records.
    3. For each claim, `collectedMinor` equals the total of its own collection records.
  - Collected cash goes back to the claim's fund (`custody` debit, fund credit).

---

## 7. Background jobs & operations

`ScholarshipFinanceJobs` runs on a timer. It is **off by default**.

| Env var | Default | Notes |
| --- | --- | --- |
| `SCHOLARSHIP_FINANCE_JOBS_ENABLED` | `false` | Enable on **one** instance. The jobs are idempotent, so overlapping runs are safe but wasteful. |
| `SCHOLARSHIP_FINANCE_JOB_INTERVAL_MS` | `900000` | Minimum 60000 |

Each run does three things:
1. Closes expired funding rounds.
2. Recomputes every balance from the journals and reports **drift**.
3. Reconciles recoveries for every tenant.

Problems are logged at `error` level and emitted as `scholarship-finance.ledger.drift-detected`. The jobs **only report; they never post corrections.** A platform admin can trigger a run with `POST /scholarship-finance/jobs/run`, and a tenant can check its own ledger with `GET .../ledger/integrity`.

**Consistency model:**
- MongoDB multi-document transactions are not assumed, because deployments may be standalone.
- Each posting runs in this order: guarded balance decrements, then increments, then the journal insert. A failure at any step undoes the balance changes already made.
- Business-state transitions are claimed atomically before posting and rolled back if the posting fails.
- A process crash in the middle of a posting can leave drift. The integrity job exists to catch exactly that. Alert on the drift event, and investigate it by rebuilding from the journals.

**Domain events emitted:** `scholarship-finance.deposit.credited`, `scholarship-finance.refund.completed`, `scholarship-finance.recovery.opened`, `scholarship-finance.ledger.drift-detected`. No listeners are bundled yet. Wiring recipient notices to `NotificationModule` is the recommended follow-up.

## 8. Privacy

- Sponsors and recipients are stored only as opaque ids (`sponsorId`, `recipientId`). No names, emails or bank details are stored.
- For fiat rails, refund destinations should be **tokenized or masked** references (the field is documented this way in the API).
- Recovery evidence is stored as references (document ids / URIs), not as documents.
- The `legalBasis.description` field is free text visible to finance viewers of the tenant. Operators must not put special-category data in it.
- Retention: ledger, audit, deposit, refund and recovery records are financial records and must not be hard-deleted. Handle erasure requests by pseudonymizing the id mapping outside this module.

## 9. Migration impact

- **Additive only.** The module adds new collections (`scholarship_*`) and indexes, which Mongoose creates on boot. No existing collection is changed.
- New optional env vars (see section 7) are registered in `env.validation.ts`.
- Existing organizations gain finance access once members are given one of the `finance_*` roles. Until then, only platform admins can use the endpoints.
- Rollback: remove `ScholarshipFinanceModule` from `AppModule`. The collections can stay in place.
- This change also restores `src/common/decorators/roles.decorator.ts`, which had been overwritten with pasted controller code and had broken every `@Roles` import.
