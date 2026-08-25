# E-Library: holds, queue estimates, and renewals

Covers `src/e-library/`: a minimal book catalog plus policy-driven holds,
loans, and renewals. Books/checkout are intentionally minimal scaffolding —
this module's purpose is holds and renewals, not a full catalog feature.

## Endpoints

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| `POST` | `/library/books` | admin, moderator | Register a book edition |
| `GET` | `/library/books` | any authenticated | List/paginate the catalog |
| `GET` | `/library/books/:id` | any authenticated | Get one book edition |
| `GET`/`PATCH` | `/library/policy` | admin | Read/update the live hold & renewal policy |
| `POST` | `/library/holds` | student | Place a hold on a book edition |
| `GET` | `/library/holds` | student | List the caller's own holds |
| `GET` | `/library/holds/:id/status` | student (owner), admin, moderator | Queue position + wait estimate |
| `DELETE` | `/library/holds/:id` | student (owner) | Cancel a hold |
| `POST` | `/library/loans` | admin, moderator | Check a book out to a patron |
| `GET` | `/library/loans` | student | List the caller's own loans |
| `POST` | `/library/loans/:id/renew` | student (owner) | Self-service renewal |
| `PATCH` | `/library/loans/:id/auto-renew` | student (owner) | Opt in/out of automatic renewal |

All routes are also mounted under `/v1/library/...`, matching the dual-prefix
pattern used elsewhere (e.g. `certification`).

## Policy (`LibraryPolicy`, singleton document)

| Field | Default | Meaning |
|-------|---------|---------|
| `maxActiveHolds` | 5 | Max holds (`pending`/`ready`) a patron may have at once |
| `allowMultipleEditionsPerWork` | `false` | Whether a patron may hold more than one edition/format of the same work |
| `loanPeriodDays` | 14 | Checkout period |
| `maxRenewals` | 2 | Renewals allowed per loan |
| `renewalExtensionDays` | 14 | Days added to the due date per renewal |
| `holdExpiryDays` | 3 | How long a hold stays valid once placed |
| `autoRenewalLeadDays` | 2 | How far ahead of the due date the auto-renewal job considers a loan |
| `version` | — | Incremented on every `PATCH`; recorded on each renewal for audit |

`GET /library/policy` creates the default singleton on first read if none
exists yet. Every `PATCH` bumps `version`.

## Hold limits & duplicate-edition rule (#1029)

`HoldsService.createHold` runs inside a Mongo transaction (with an automatic
fallback to direct execution against a standalone/non-replica-set database,
matching `CurriculumService`'s pattern):

1. 404 if the book doesn't exist.
2. 409 `BIZ_HOLD_LIMIT_REACHED` if the patron's active hold count is at
   `maxActiveHolds`.
3. 409 `BIZ_DUPLICATE_EDITION_HOLD` if `allowMultipleEditionsPerWork` is
   `false` and the patron already holds or has borrowed another edition of
   the same `workKey`.
4. A unique partial index on `{ patronId, bookId, status: pending|ready }`
   makes "the exact same edition twice" impossible even under a race;
   a duplicate-key error is translated to 409 `BIZ_HOLD_ALREADY_EXISTS`.

## Queue position & wait estimate (#1030)

`GET /library/holds/:id/status` is owner-or-staff only
(`assertOwnerOrStaff`), and the response never contains another patron's
identity — only the caller's own hold, a `queuePosition`, and an
`estimatedWaitDays`.

- `queuePosition` = count of `pending` holds on the same book requested
  earlier than this one, + 1.
- `estimatedWaitDays` = `ceil(queuePosition / totalCopies) * loanPeriodDays`.

This is deliberately conservative: it assumes every copy takes a full
`loanPeriodDays` to cycle back and rounds up, so it never promises a wait
shorter than what the policy can realistically deliver.

## Self-service renewal (#1031)

`POST /library/loans/:id/renew` is owner-only (no staff override — this is
self-service). Inside a transaction, in order:

1. Loan must be `active` → else 409 `BIZ_LOAN_NOT_ACTIVE`.
2. Not overdue (`dueDate >= now`) → else 409 `BIZ_LOAN_OVERDUE`.
3. `renewalCount < maxRenewals` → else 409 `BIZ_RENEWAL_LIMIT_REACHED`.
4. `copyStatus === 'normal'` → else 409 `BIZ_COPY_NOT_RENEWABLE`.
5. No other patron holds this book → else 409 `BIZ_BOOK_HAS_HOLDS`.

The mutation is one `findOneAndUpdate` whose filter repeats every guard
condition, so a concurrent change (return, new hold, hitting the limit)
causes the update to no-op rather than corrupt state. Every renewal appends
a `renewalHistory` entry: `previousDueDate`, `newDueDate`, `renewedAt`,
`policyVersion`, `method: 'manual'`.

## Automatic renewal (#1032)

`AutoRenewalService.run()` fires daily (`@Cron(CronExpression.EVERY_DAY_AT_2AM)`,
same mechanism as `StellarSyncService`). To change the schedule, edit the
`@Cron(...)` expression in `src/e-library/auto-renewal.service.ts`.

**Locking/idempotency** — there's no Redis/Bull lock in this codebase, so
each loan is "claimed" for the day by inserting into
`library_auto_renewal_runs` (`{ loanId, runDate }`, unique index). A
duplicate-key error means another run or instance already claimed that loan
today, so it's skipped — the same Mongo unique-index claim pattern
`IdempotencyService` uses for request idempotency, applied to job runs
instead of HTTP requests. This makes reruns (e.g. after a crash) safe: a
loan already renewed or declined today is never reprocessed.

Each candidate loan (active, `autoRenewEnabled`, due within
`autoRenewalLeadDays`) runs through the *same* eligibility checks as manual
renewal — it is never renewed if another patron holds the book, is overdue,
flagged, or past its renewal limit. The `AutoRenewalRun` document records
`decision: 'renewed' | 'declined'` and, on decline, a `reason` (the same
message a manual renewal would have returned). The borrower is notified
either way via `NotificationService`.

To re-trigger a stuck run for a specific day, delete its
`library_auto_renewal_runs` document(s) and re-invoke
`AutoRenewalService.run()` (e.g. from a REPL/console) — the job will
re-evaluate those loans since the claim is gone.

Borrowers opt in/out with `PATCH /library/loans/:id/auto-renew`
(`autoRenewEnabled`, defaults to `false`).

## Error codes

| Code | HTTP | When |
|------|------|------|
| `RES_BOOK_NOT_FOUND` | 404 | Unknown book id |
| `RES_HOLD_NOT_FOUND` | 404 | Unknown hold id |
| `RES_LOAN_NOT_FOUND` | 404 | Unknown loan id |
| `BIZ_HOLD_LIMIT_REACHED` | 409 | Patron is at `maxActiveHolds` |
| `BIZ_DUPLICATE_EDITION_HOLD` | 409 | Patron already holds/borrowed another edition of the work |
| `BIZ_HOLD_ALREADY_EXISTS` | 409 | Patron already holds this exact edition |
| `BIZ_LOAN_NOT_ACTIVE` | 409 | Loan already returned, or state changed mid-renewal |
| `BIZ_LOAN_OVERDUE` | 409 | Loan is past its due date |
| `BIZ_RENEWAL_LIMIT_REACHED` | 409 | Loan is at `maxRenewals` |
| `BIZ_COPY_NOT_RENEWABLE` | 409 | Copy is damaged/lost/flagged |
| `BIZ_BOOK_HAS_HOLDS` | 409 | Another patron holds this book |
| `BIZ_NO_COPIES_AVAILABLE` | 409 | Checkout requested with zero `availableCopies` |
