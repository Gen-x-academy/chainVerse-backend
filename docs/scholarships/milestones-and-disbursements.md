# Scholarship milestones, verification and disbursement intents

Covers issues #1154 (milestone schedules), #1155 (evidence submission), #1156
(evidence verification) and #1157 (idempotent disbursement intents).

Implementation: [`src/scholarship/`](../../src/scholarship/). All routes are
under `/api/v1/organizations/:orgId/scholarships` and appear in Swagger under
the *Scholarships*, *Scholarship Milestones* and *Scholarship Disbursements*
tags.

## Flow

```
award ──► draft schedule ──► active schedule ──► evidence (v1, v2, …)
                                   ▲                       │
                  governed amendment                 verifier decision
                                                           │ approve
                                                           ▼
                                       payment eligibility (one per milestone)
                                                           │ event + cron
                                                           ▼
                                        disbursement intent (one per milestone)
                                                           │ external executor
                                                           ▼
                                        submitted ─► confirmed / failed ─► (resubmit)
```

`ScholarshipAward` is a minimal foundation for this flow (recipient, wallet,
currency, total, optional period). A fuller award or application domain can
extend it; schedules and intents only depend on the fields listed here.

## Ownership and authorization

Every record carries `organizationId`, and every lookup filters on the
`:orgId` in the path. An id from another organization returns 404, the same
as a missing id, so ids can't be probed across tenants.

| Action | Who |
| --- | --- |
| Create or list awards; list schedule versions | org `owner` / `admin` (`instructor` can read) |
| Create, edit or activate a draft schedule; propose an amendment | org `owner` / `admin` |
| Approve or reject an amendment | org `owner` / `admin` **other than the proposer** |
| View the active schedule | recipient, any org member, platform admin |
| Submit evidence | recipient (`submitterType=recipient`) or org `owner` / `admin` / platform admin acting as a trusted system (`submitterType=system`) |
| List or decrypt evidence; list decisions | recipient, org `owner` / `admin`, or a verifier assigned to that milestone |
| Assign or revoke verifiers | org `owner` / `admin` |
| Decide evidence | active verifier assignment covering the milestone. The org role alone is not enough. |
| Create, list or transition disbursement intents | org `owner` / `admin` |

The platform-admin break-glass in `OrganizationRolesGuard` still applies to
staff routes. It does **not** bypass the verifier-assignment or
conflict-of-interest rules.

## Milestone schedules (#1154)

A milestone has a stable `key`, a `type` (`enrollment`, `attendance`,
`coursework`, `completion` or `custom`), a `title`, `percentageBps` and a
`dueDate`. A `custom` milestone also needs a `description`.

Validation, applied on create, edit, activate and amendment:

- Basis points must total exactly 10 000.
- Amounts are derived on the server: `floor(total × bps / 10000)` for each
  milestone, and the last milestone takes the rounding remainder. They always
  sum to the award total. A client may send `amountMinor` as a cross-check; a
  mismatch is rejected.
- Every milestone must allocate more than 0.
- Due dates must strictly increase in array order and fall inside the award
  period, if one is set.
- Keys must be unique.

Lifecycle: `draft` → `active` → `superseded`. An award has at most one active
schedule, one open draft and one pending amendment. Partial unique indexes
enforce this.

**Immutability.** After activation, the service refuses edits (409
`BIZ_SCHOLARSHIP_SCHEDULE_IMMUTABLE`). A schema hook also rejects any write to
`milestones` unless the query filter pins `status: 'draft'`.

**Governed amendment.** Changing an active plan takes two people:

1. `POST …/schedules/:activeId/amendments` with the new milestones and a
   `reason` creates a `pending_amendment` version.
2. A different owner or admin calls
   `POST …/schedules/:amendmentId/amendment-decision` with `approve` or
   `reject`.

A milestone with evidence under review, or with a decision (`approved` or
`rejected`), is locked. The amendment must keep it with the same key, type,
bps and amount. The lock is checked at proposal and checked again at approval.
When an amendment is approved, open milestones that it removes become
`withdrawn`.

| Method & path (relative to `/organizations/:orgId/scholarships`) | Purpose |
| --- | --- |
| `POST /awards` | Create an award |
| `GET /awards`, `GET /awards/:awardId` | Read awards |
| `GET /awards/:awardId/schedules` | Every schedule version |
| `GET /awards/:awardId/schedules/active` | The binding schedule |
| `POST /awards/:awardId/schedules` | Create a draft |
| `PUT /awards/:awardId/schedules/:scheduleId` | Replace a draft's milestones |
| `POST /awards/:awardId/schedules/:scheduleId/activate` | Activate a draft |
| `POST /awards/:awardId/schedules/:scheduleId/amendments` | Propose an amendment |
| `POST /awards/:awardId/schedules/:amendmentId/amendment-decision` | Approve or reject an amendment |

## Evidence submission (#1155)

`POST /awards/:awardId/milestones/:milestoneKey/evidence`

```json
{
  "submissionKey": "9f1c2a7e-3b0d-4f55-9d34-5f1b2c3d4e5f",
  "evidenceType": "attendance_record",
  "details": { "term": "2027-spring", "attendanceRate": 0.92 },
  "documentReferences": [{ "storageKey": "clean/ab12…", "sha256": "…" }]
}
```

- **Versioned.** Each accepted submission is a new, append-only version
  (`1, 2, …` per milestone). A correction is a new version, never an edit.
- **Idempotent.** Returns `201` for a new version and `200` with
  `replayed: true` for a duplicate:
  - Same `submissionKey` and same content: the original version is returned.
  - Same `submissionKey` and different content: `409
    BIZ_SCHOLARSHIP_EVIDENCE_KEY_REUSED`.
  - New key but content identical to the latest version: the latest version is
    returned.
- **Accepted only while the milestone is active.** The milestone must be in the
  active schedule and in `pending`, `evidence_submitted` or
  `changes_requested`.
- **Encrypted off-chain.** `details` and `documentReferences` are stored as
  AES-256-GCM ciphertext. The additional authenticated data binds each
  ciphertext to `(org, award, milestone, version)`, so a payload copied onto
  another record fails authentication. Only routing metadata is stored in
  plaintext: type, submitter, version, and the count of references.
- **Privacy-minimised duplicate detection.** Duplicates are detected with a
  keyed HMAC (`contentDigest`), not a bare hash, so low-entropy content cannot
  be guessed from the digest. Inline content is capped at 8 KB; send files as
  references to scanned uploads (see [uploads](../security/uploads.md)).

| Method & path | Purpose |
| --- | --- |
| `POST /awards/:awardId/milestones/:milestoneKey/evidence` | Submit evidence |
| `GET /awards/:awardId/milestones/:milestoneKey/evidence` | List versions (metadata only) |
| `GET /awards/:awardId/evidence/:evidenceId` | Decrypt one version (every read is audited) |

## Verification (#1156)

**Assignment.** `POST /awards/:awardId/verifiers` takes `{ verifierId,
milestoneKeys? }`. Leaving out `milestoneKeys` covers every milestone.

**Conflicts that are blocked** (`403 BIZ_SCHOLARSHIP_VERIFIER_CONFLICT`):

- The recipient can't be assigned to, or decide on, their own award.
- A caller can't assign themselves.
- A verifier can't decide evidence they submitted.
- A verifier must be an active member of the organization.

**Decision.** `POST /awards/:awardId/evidence/:evidenceId/decisions` takes
`{ decision, reasonCode, note? }`. The reason code must be valid for the
decision (`422 BIZ_SCHOLARSHIP_REASON_CODE_MISMATCH`):

| Decision | Reason codes | Milestone becomes |
| --- | --- | --- |
| `approve` | `EVIDENCE_SUFFICIENT`, `VERIFIED_WITH_ISSUER` | `approved` |
| `reject` | `EVIDENCE_INVALID`, `MILESTONE_NOT_MET`, `DEADLINE_MISSED`, `FRAUD_SUSPECTED`, `RECIPIENT_INELIGIBLE` | `rejected` |
| `request_changes` | `MISSING_INFORMATION`, `ILLEGIBLE_OR_CORRUPT`, `WRONG_MILESTONE`, `NEEDS_ISSUER_CONFIRMATION` | `changes_requested` (recipient may submit a new version) |

Only the **latest** evidence version can be decided. The decision claims the
milestone with a compare-and-set: `status = evidence_submitted AND
latestEvidenceId = :evidenceId`. Concurrent or repeated decisions fail with
`409 BIZ_SCHOLARSHIP_ALREADY_DECIDED` or `BIZ_SCHOLARSHIP_EVIDENCE_STALE`.

**Auditability.** Decisions are stored in the insert-only
`scholarship_verification_decisions` collection, which has a unique index on
`evidenceId` and an immutability hook. Each decision is also written to the
HMAC-protected audit log. `GET /awards/:awardId/milestones/:milestoneKey/decisions`
returns the history.

**At most one payment eligibility event.** An approval inserts one
`scholarship_payment_eligibilities` row, unique on `(awardId, milestoneKey)`,
which snapshots the amount, currency, recipient and wallet. The
`scholarship.payment-eligible` event is emitted only by the call whose insert
succeeded. If the process crashes between the approval and the insert, the
reconciliation job repairs it and emits the event then.

## Disbursement intents (#1157)

An intent is the single, stable payment instruction for one installment. It is
created before anything is executed externally.

- **Intent key.**
  `sha256("scholarship-disbursement:v1:{orgId}:{awardId}:{milestoneKey}")`,
  uniquely indexed. `eligibilityId` is also unique. However many times creation
  is retried, and by whichever path (event listener, cron, or
  `POST /disbursement-intents`), one installment can map to only one intent.
- **Immutable financial fields.** `amountMinor`, `currency`, `recipientId`,
  `recipientWallet` and the key fields are copied from the eligibility and
  cannot be changed: a schema hook rejects any update or replace that touches
  them.
- **Retries reconcile.** Creating an intent that already exists returns it with
  `200` and `created: false`, after checking every pinned field against the
  eligibility. A disagreement is refused (`409
  BIZ_SCHOLARSHIP_INTENT_INTEGRITY`) and logged, not overwritten.
- **Execution state.** `POST /disbursement-intents/:intentId/transitions`
  records executor outcomes: `created → submitted → confirmed | failed`,
  `failed → submitted` (a retry of the *same* intent, which increments
  `attempts`), and `created | failed → cancelled`. Transitions are
  compare-and-set on the current status, and an exact repeat is a no-op. A
  second `submitted` with a different `externalReference` is refused because it
  is the double-payment case. Every transition is appended to `transitions[]`
  and to the audit log.

| Method & path | Purpose |
| --- | --- |
| `POST /disbursement-intents` `{ eligibilityId }` | Create or reconcile (`201` new, `200` existing) |
| `GET /disbursement-intents?status=&awardId=` | List |
| `GET /disbursement-intents/:intentId` | Read |
| `POST /disbursement-intents/:intentId/transitions` | Record external execution state |

The `scholarship.disbursement-intent-created` event fires once per new intent.
An executor, such as a Stellar payment worker, should subscribe to it and
report back through the transitions endpoint, using the tx hash as
`externalReference`.

## Privacy

- Evidence content is encrypted at the application layer and is never returned
  by list endpoints. Decryption requires an explicit per-record request, and
  each one writes a `scholarship_evidence.accessed` audit entry.
- Audit entries record ids, statuses, amounts and reason codes, never evidence
  content. Tell verifiers not to paste evidence into `note`.
- Nothing about evidence is written on-chain. Only a future executor will
  submit payment transactions, which carry the wallet and amount.
- Retention: evidence and decisions are append-only by design. Removing
  personal data (erasure requests) means deleting the ciphertext or the key.
  Coordinate with the removal-request flow before enabling that.

## Migration

- Eight new collections, created on first write: `scholarship_awards`,
  `scholarship_milestone_schedules`, `scholarship_milestone_progress`,
  `scholarship_milestone_evidence`, `scholarship_verifier_assignments`,
  `scholarship_verification_decisions`, `scholarship_payment_eligibilities`
  and `scholarship_disbursement_intents`.
- The unique and partial indexes carry the correctness guarantees above. They
  are created by Mongoose `autoIndex` on boot. If `autoIndex` is disabled in
  production, run `syncIndexes()` for these models **before** enabling the
  routes.
- No existing collection or API changes. The existing financial-aid module is
  untouched.

## Operations

| Variable | Default | Notes |
| --- | --- | --- |
| `SCHOLARSHIP_EVIDENCE_ENCRYPTION_KEY` | unset | Base64 32-byte key. **Required in production**: the app refuses to boot without it. In development a key is derived from `JWT_SECRET` and a warning is logged. |
| `SCHOLARSHIP_EVIDENCE_ENCRYPTION_KEY_ID` | `v1` | Stored with every ciphertext. Only the current key is loaded, so a rotation needs a re-encryption job before the old key is retired. |

- **Back up the key separately from the database.** If the key is lost,
  existing evidence can't be read.
- **Reconciliation cron** (`scholarship-disbursement-reconciliation`) runs
  every 5 minutes on every instance. Each run handles batches of 100, repairs
  approvals that have no eligibility, and creates intents for eligibilities
  older than 60 s that have none. It is idempotent, so running it on several
  instances at once is safe. It needs `ScheduleModule.forRoot()`, which
  `StellarModule` already registers.
- Watch the logs for `disagrees with eligibility` (an integrity fault that
  needs manual review) and `Repaired missing eligibility` (a crash was
  recovered).
- New error codes: `BIZ_SCHOLARSHIP_*` in
  [`error-codes.enum.ts`](../../src/common/errors/error-codes.enum.ts). New
  audit actions: `scholarship_*` in
  [`audit-action.enum.ts`](../../src/common/audit/audit-action.enum.ts).
- No multi-document transactions are used, so a standalone MongoDB works.
  Amendment approval swaps schedules in two compare-and-set steps and rolls
  back the first if the second fails.
