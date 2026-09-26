# Scholarship disbursements

Pays scholarship installments on Stellar. The feature covers four parts:

| Issue | Capability |
|-------|------------|
| #1159 | Governed per-program payout assets (native XLM or issued assets) with trustline guidance |
| #1158 | Proof that a recipient controls their payout address, with safe holds when it changes |
| #1160 | Bounded, automation-only execution of due installments |
| #1161 | Evidence-based tracking of submitted → pending → successful / failed / expired / reversed |

Code: `src/scholarship-disbursement/`. The module owns seven collections (listed under
[Migration](#migration)). It reads `organizationmembers` for authorization and recipient checks.

## Ownership and tenancy

Every record carries `organizationId`, and every route is nested under
`/api/v1/organizations/:organizationId/scholarships`. `OrganizationRolesGuard` resolves the
caller's membership in that organization. Every query filters on the organization from the
path, so a payment, asset or wallet id from another organization returns 404, never another
tenant's data.

| Role | Can |
|------|-----|
| `owner`, `admin` ("staff") | Propose, approve and disable assets; schedule, cancel, release, retry and reverse payments; list payments; read wallet history |
| Any member | Verify their own payout wallet, read their own wallet, payments and trustline status |
| Platform `admin` | Same as staff through the existing break-glass path in `OrganizationRolesGuard`. Four-eyes asset approval still applies. |
| Automation | Triggers execution and reconciliation only, with `X-Automation-Token`. User JWTs cannot trigger payouts. |

`programId` is an opaque, tenant-scoped identifier (`[A-Za-z0-9_-]{1,64}`). No scholarship
program domain exists yet. When one is added, `programId` should reference it.

## Assets (#1159)

1. Staff call `POST /assets` with `programId`, `network`, `assetType`, `code`, `issuer`,
   `decimals` (0–7) and optionally `requiredConfirmations`.
2. Unsupported definitions fail before anything is stored (`422 BIZ_SCHOLARSHIP_ASSET_UNSUPPORTED`):
   - the network differs from `STELLAR_NETWORK`
   - the native asset is not `XLM`, or has an issuer
   - the code length does not fit the asset type
   - the issuer is not a valid `G…` key
   - `decimals` is greater than 7
3. The asset starts as `proposed` and cannot be used yet. A **different** owner/admin calls
   `POST /assets/:id/approve`. Approval re-validates the definition and checks on Horizon that
   the issuer account exists.
4. `POST /assets/:id/disable` retires an asset. No one can edit an asset in place: to change
   one, propose a new asset and disable the old one. Every step is audited
   (`scholarship_asset.*`).

A partial unique index allows only one live (`proposed` or `active`) configuration per
org/program/network/code/issuer.

Payments are validated against the asset:

- the asset must be `active`, belong to the payment's program, and be on the platform network
- the amount must be positive, within int64 stroops, and have no more fraction digits than
  the asset's `decimals`

Amounts are stored in Horizon's canonical 7-decimal form (for example, `"250.0000000"`).

**Trustline guidance.** `GET /assets/:id/trustline` checks the caller's verified address on
Horizon and returns one of these statuses:

- `no_verified_wallet`
- `account_not_found`
- `trustline_missing`
- `trustline_not_authorized`
- `ready`

Every status except `ready` includes concrete steps to fix it. The executor runs the same
check before each payment and skips (does not fail) payments whose destination cannot
receive the asset.

## Payout wallet verification (#1158)

```
POST /payout-wallet/challenges                 { "address": "G..." }
  → { challengeId, message, expiresAt, network, address }
POST /payout-wallet/challenges/:id/verify      { "signature": "<base64|hex>" }
  → { wallet, changed, heldPayments }
GET  /payout-wallet                            (caller's verified wallet)
GET  /payout-wallets/:recipientId              (staff: address history)
```

The recipient signs `message` with their wallet's SEP-53 `signMessage` (for example,
Freighter). The server verifies an ed25519 signature over
`SHA-256("Stellar Signed Message:\n" + message)`. The message is domain-separated twice: by
the SEP-53 prefix, and by its own first line:

```
chainverse:scholarship-payout-wallet-verification:v1
network:testnet
organization:<orgId>
recipient:<userId>
address:<G...>
challenge:<challengeId>
nonce:<32 random bytes, hex>
expires:<ISO-8601>
```

Because the signature is bound to the organization, recipient, address, network and
challenge, it cannot be replayed anywhere else.

Challenges are single-use:

- Consumption is an atomic compare-and-set, so a signature is accepted at most once.
- A challenge expires after `SCHOLARSHIP_WALLET_CHALLENGE_TTL_SECONDS`.
- It locks after `SCHOLARSHIP_WALLET_CHALLENGE_MAX_ATTEMPTS` bad signatures.
- Issuing a new challenge invalidates the recipient's older ones.
- A TTL index purges challenges one day after expiry.

**Address change → safe hold.** When a recipient who already has a verified address proves
control of a different address:

1. Every `scheduled` payment for that recipient in the organization moves to `on_hold`
   (`holdReason: payout_wallet_changed`). This happens first, so the executor's
   compare-and-set from `scheduled` fails for any payment it was about to send.
2. The old wallet becomes `superseded` and the new one `verified`.
3. The change is audited (`payout_wallet.changed`) and emits
   `scholarship.payout-wallet-changed` so notification listeners can alert the recipient
   and staff.

Payments already `submitted`/`pending` are on the network and cannot be held. They keep
being tracked against the address they were sent to. Staff return a held payment to the
schedule with `POST /payments/:id/release-hold`, which requires a verified wallet. The
executor always pays the address that is verified at execution time.

## Payments and execution (#1160)

```
POST /payments                     schedule { programId, recipientId, assetId, amount, dueAt, externalReference }
GET  /payments                     staff list (status, recipientId, programId, page, limit ≤ 100)
GET  /payments/me                  recipient's own
GET  /payments/:id                 staff, or the recipient (others get 404)
POST /payments/:id/cancel          { reason }   scheduled | on_hold → cancelled
POST /payments/:id/release-hold    { reason }   on_hold → scheduled
POST /payments/:id/retry           { reason }   failed | expired → scheduled
POST /payments/:id/reversal        { transactionHash, reason }  successful → reversed
```

The recipient must be an active member of the organization. `externalReference` is unique
per organization, so scheduling the same installment twice returns `409`.

**Automation.** Automation triggers runs in one of two ways:

- `POST /api/v1/scholarships/disbursements/execute` or `…/reconcile`, with
  `X-Automation-Token: $SCHOLARSHIP_AUTOMATION_TOKEN` and an optional
  `{ organizationId, batchSize ≤ 100 }`
- the in-process cron (every minute) when `SCHOLARSHIP_DISBURSEMENT_CRON_ENABLED=true`

Both paths fail closed:

- with no token configured, the endpoints return 401
- with no treasury secret, the executor does not start

A Mongo lock (`scholarship_disbursement_locks`) keeps each job to one run cluster-wide. This
matters because all payouts share the treasury's sequence number.

**Per-intent flow** (sequential, up to `batchSize`):

1. **Claim.** Lease the oldest due `scheduled` payment (`leaseOwner`/`leaseUntil`). If a lease
   expires, the executor crashed before submitting, so the payment is safe to reclaim.
2. **Pre-flight.** The asset is active, the recipient has a verified wallet, and the
   destination exists and holds an authorized trustline. On failure, the payment is
   **skipped**: the lease is released, `lastError` is set, and it stays `scheduled` for the
   next run.
3. **Build and sign.** A single `payment` operation with a hash memo of
   `sha256("chainverse:scholarship-payment:<id>:<attempt>")`, and `maxTime = now +
   SCHOLARSHIP_SUBMISSION_TIMEOUT_SECONDS`.
4. **Write-ahead.** A compare-and-set `scheduled → submitted` stores the tx hash,
   destination, source, memo and `maxTime` *before* submission. If the payment was
   cancelled, held or re-leased in the meantime, it is not sent.
5. **Submit.** Included → `pending`. Rejected (HTTP 400) → `failed`. Timeout or transport
   error → stays `submitted` and **halts the batch**, because the sequence number may have
   been consumed. A `tx_bad_seq` rejection also halts.

Each run is stored in `scholarship_disbursement_runs` with a per-intent outcome (`submitted`,
`pending`, `failed`, `skipped_*`, `unchanged`, `error`) and a summary, and is audited as
`scholarship_disbursement.run`. The payment document stays the source of truth. The run
record reports what happened to each intent, so a partial batch can be reconciled one intent
at a time.

## Transaction states (#1161)

```
scheduled ─▶ submitted ─▶ pending ─▶ successful ─▶ reversed
   │  ▲          │  └──────────────▶ failed ──retry──▶ scheduled
   │  └ on_hold  └─(unseen past maxTime)─▶ expired ──retry──▶ scheduled
   └────────────▶ cancelled
```

The reconciler only moves a state forward on **verified network evidence**. For every
`submitted`/`pending` payment (least recently checked first) it fetches the transaction by
hash:

- **Found, successful, and matches exactly:**
  - the source account is the one that signed
  - the memo is the attempt's hash
  - there is exactly one `payment` operation, with the expected destination, amount and asset

  Then confirmations = `tip − includedLedger + 1`. Below the required count the payment is
  `pending`. At or above it, the payment **finalizes**.
- **Found but failed on-chain:** `failed`.
- **Found and successful, but not matching:** the payment is *not* finalized. It stays in
  flight with `lastError: evidence mismatch: …`, logs an error, and reports
  `evidence_mismatch` on every run until an operator investigates.
- **Not found**, and the latest *closed ledger's* time is past `maxTime +
  SCHOLARSHIP_EXPIRY_GRACE_SECONDS`: `expired`. The reconciler uses ledger time rather than
  the local clock, so a lagging Horizon cannot expire a transaction that could still land.

**Confirmations are configurable.** The default is `SCHOLARSHIP_REQUIRED_CONFIRMATIONS`, and
an asset can override it with `requiredConfirmations`. The required count is captured on the
payment at submission.

**A payment cannot finalize twice:**

1. The payout ledger entry is written first, as an idempotent upsert keyed by
   `(paymentId, type)`, which is unique.
2. The status flips with a compare-and-set from `submitted|pending`. Exactly one caller wins.
3. `txHash` is unique across payments, and `(txHash, type)` is unique across ledger entries,
   so one transaction can never settle two payments.

Every successful payment records a `ledgerReference`
(`txHash`, `ledger`, `operationId`, `pagingToken`, `closedAt`) and a row in
`scholarship_ledger_entries`.

**Retry.** Staff can retry only `failed`/`expired` payments. Before a retry, the server
checks with Horizon that the previous hash did not succeed and that a ledger has closed past
its `maxTime`. The previous attempt stays in `attempts[]`.

**Reversal.** Stellar payments are final, so a reversal must point at a later, confirmed,
successful transaction that moves the full amount of the same asset out of the paid address.
That transaction must be either an issuer `clawback`, or a `payment` back to the treasury
account that sent the payout. The server records a `reversal` ledger entry, and the same
transaction cannot evidence two reversals.

Terminal outcomes (`successful`, `failed`, `expired`, `reversed`) emit
`scholarship.payment-settled`.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `STELLAR_NETWORK` | `testnet` | Platform network (`testnet` or `public`/`mainnet`). Assets must match. |
| `SCHOLARSHIP_TREASURY_SECRET` | — | Signs payouts. Unset: the executor refuses to run. |
| `SCHOLARSHIP_AUTOMATION_TOKEN` | — | ≥ 32 chars. Unset: the automation endpoints reject all calls. |
| `SCHOLARSHIP_DISBURSEMENT_CRON_ENABLED` | `false` | In-process cron for reconcile + execute. |
| `SCHOLARSHIP_REQUIRED_CONFIRMATIONS` | `1` | Default confirmation depth (1–100). |
| `SCHOLARSHIP_BATCH_SIZE` | `25` | Default batch size (max 100). |
| `SCHOLARSHIP_SUBMISSION_TIMEOUT_SECONDS` | `180` | Transaction `maxTime` offset. |
| `SCHOLARSHIP_EXPIRY_GRACE_SECONDS` | `60` | Extra wait past `maxTime` before expiry. |
| `SCHOLARSHIP_BASE_FEE_STROOPS` | `100` | Fee per operation. |
| `SCHOLARSHIP_LEASE_SECONDS` | `300` | Payment lease and run-lock lifetime. |
| `SCHOLARSHIP_WALLET_CHALLENGE_TTL_SECONDS` | `600` | Challenge lifetime. |
| `SCHOLARSHIP_WALLET_CHALLENGE_MAX_ATTEMPTS` | `5` | Bad signatures before a challenge locks. |

## Error codes

| Code | HTTP | When |
|------|------|------|
| `BIZ_SCHOLARSHIP_ASSET_UNSUPPORTED` | 422 | Asset definition invalid, wrong network, or issuer missing on-chain |
| `BIZ_SCHOLARSHIP_ASSET_NOT_ACTIVE` | 422 | Asset not active for the program, or not in an approvable state |
| `BIZ_SCHOLARSHIP_ASSET_SELF_APPROVAL` | 422 | Proposer tried to approve their own asset |
| `BIZ_SCHOLARSHIP_AMOUNT_INVALID` | 422 | Amount not positive, or too precise for the asset |
| `BIZ_SCHOLARSHIP_RECIPIENT_NOT_MEMBER` | 422 | Recipient is not a member of the organization |
| `BIZ_SCHOLARSHIP_PAYMENT_STATE` | 422 | Transition not allowed from the current state, or retry too early |
| `BIZ_SCHOLARSHIP_REVERSAL_UNVERIFIED` | 422 | Transaction does not evidence a confirmed reversal |
| `BIZ_WALLET_CHALLENGE_EXPIRED` / `_USED` / `_LOCKED` | 422 | Challenge unusable |
| `BIZ_WALLET_SIGNATURE_INVALID` | 422 | Signature does not match the message and address |
| `RES_SCHOLARSHIP_ASSET_NOT_FOUND` / `RES_SCHOLARSHIP_PAYMENT_NOT_FOUND` / `RES_PAYOUT_WALLET_NOT_FOUND` / `RES_WALLET_CHALLENGE_NOT_FOUND` | 404 | Not found in this organization |
| `RES_ALREADY_EXISTS` | 409 | Duplicate `externalReference`, duplicate live asset, reversal tx reuse |
| `AUTH_AUTOMATION_TOKEN_INVALID` | 401 | Missing or wrong automation token |
| `SYS_SERVICE_UNAVAILABLE` | 503 | Horizon unreachable during a synchronous check |

## Privacy

- **Payout addresses** are linkable to a real person once associated with a user id, and
  every payment to them is public on-chain. Only the recipient and org staff can read an
  address through the API. Address history is kept (as `superseded`) because past payments
  reference it.
- **Audit entries** record wallet changes with the old and new address, for fraud review.
- **Challenge documents** hold only the public address, the nonce and the message. The
  server never receives a secret key.
- **Deletion:** removing a user does not cascade into these collections. Ledger entries and
  finalized payments are financial records and should be retained under the organization's
  retention policy. Account deletion flows should anonymize `recipientId` rather than delete
  rows.

## Migration

This is additive only; no existing data changes. Mongoose creates these collections and
indexes on boot:

| Collection | Notable indexes |
|------------|-----------------|
| `scholarship_assets` | partial-unique live configuration |
| `scholarship_payout_wallets` | partial-unique verified wallet per org/recipient |
| `scholarship_wallet_challenges` | TTL on `expiresAt` (+1 day) |
| `scholarship_payments` | unique `(organizationId, externalReference)`, partial-unique `txHash`, `(status, dueAt)` |
| `scholarship_ledger_entries` | unique `(paymentId, type)`, unique `(txHash, type)` |
| `scholarship_disbursement_runs` | TTL 90 days on `startedAt` |
| `scholarship_disbursement_locks` | — |

If `autoIndex` is disabled in production, create these indexes before enabling execution.
The unique indexes are part of the double-payment protection.

## Operational impact

- **Treasury.**
  - Fund the treasury account for payouts plus fees, and add trustlines for every issued
    asset it pays out.
  - Keep `SCHOLARSHIP_TREASURY_SECRET` in the secret manager, never in `.env` files that are
    committed.
  - This version uses one platform treasury for all organizations. Funds are not segregated
    per tenant on-chain; accounting is per tenant through `scholarship_ledger_entries`.
- **Enabling payouts** needs three things:
  - a treasury secret
  - either cron or an external scheduler calling `/execute` and `/reconcile` about once a
    minute
  - at least one approved asset

  Always run reconcile at least as often as execute.
- **Alert on:**
  - runs with `haltReason`
  - any `evidence_mismatch` outcome
  - payments stuck in `submitted` well past `txMaxTime`, which means reconcile is not running
  - repeated `skipped_missing_trustline`, which means recipients need to add a trustline
- **Horizon outage:**
  - execution skips or halts without losing track of anything, because the hash is stored
    before submission
  - reconciliation retries the next run
  - synchronous staff actions that need Horizon (asset approval, retry, reversal) return 503
- **Rollback:** disable cron and unset the automation token. Payments in flight keep their
  hashes and can be reconciled after re-enabling.
