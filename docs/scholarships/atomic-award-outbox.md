# Atomic scholarship writes and the transactional outbox (#1255)

## The problem

Awarding a scholarship is a multi-document decision. Creating an award moves a
budget reservation, adjusts the program's budget ledger, writes an audit trail
and notifies another context. Approving a milestone creates a verification
decision, unlocks a payment eligibility, and causes a disbursement intent to be
created somewhere else entirely.

Each of those used to be a separate `await`. The code compensated by hand — on a
failed write, issue a compensating write for the one that already landed. That
works right up to the moment the process dies between the two writes, at which
point there is no compensation to run, because there is no code running at all.

The states that produced are not exotic. They are ordinary:

| State | How |
| --- | --- |
| Award `ACTIVE`, reservation still `PENDING` | Crash after the award insert |
| Reservation `EXPIRED`, ledger still holding the funds | Crash after the reservation update, before the `$inc` |
| Milestone `APPROVED`, no decision row | Crash after the progress claim, before the decision insert |
| Intent exists, `eligibility.disbursementIntentId` still null | Two separate writes; the link is read from the eligibility |

None of them is reported by an error, because no error occurred. They are found
days later, by a reconciliation job, or by a scholarship officer noticing that a
recipient was paid twice.

The events were unreliable for the same reason and one step earlier. The
in-process `EventEmitter2` was called *before* the surrounding writes committed,
so a listener could act on a fact that was subsequently rolled back — and if the
process died between the commit and the `emit`, the event was simply gone with no
record that it had ever existed.

## The approach

Two mechanisms, applied to every path that writes more than one document or that
publishes an event.

### 1. Transactions, for grouping

`ScholarshipTransactionRunner.run(label, work)` opens a session and runs `work`
inside `withTransaction`. Every document write in `work` is enlisted by passing
the session to it, via `withSession(query, session)`. Every event is *staged*
into the outbox under the same session. Either all of it commits or none of it
does; there is no compensation path to get wrong because there is no compensation
path.

Compare-and-set is used rather than read-then-write wherever two callers could
race. A status transition filters on the status it expects, so a caller that lost
the race updates zero documents instead of overwriting a newer state:

```ts
const updated = await withSession(
  this.awardModel.findOneAndUpdate(
    { _id: awardId, organizationId, status: expectFrom },
    { $set: { ...set, status: toStatus }, $push: { statusHistory: … } },
    { new: true },
  ),
  session,
).exec();
if (!updated) throw new ResourceConflictException(…);
```

Two partial unique indexes back this up at the storage layer, so the database
refuses a duplicate even if the application-level check is somehow bypassed:
`uniq_active_award_per_application` and the equivalent on reservations.

### 2. Transactional outbox, for delivery

`OutboxService.stage()` inserts a row into `outbox_events` **inside the caller's
transaction**. Because the insert commits with the business write, the two cannot
disagree: there is no state in which the award exists and the event does not, and
none in which the event exists and the award does not.

`OutboxRelayJob` then publishes committed rows every 10 seconds and once at
bootstrap. It does three things that matter:

- **Claims with a compare-and-set on the attempt counter.** Filtering only on
  `status: PENDING` is not a claim — the update does not change `status`, so two
  relays that both read the row would both match and both publish. Pinning
  `attempts` means the first relay's increment invalidates the second's filter.
- **Parks the row for at least `OUTBOX_LEASE_MS`.** A handler slower than the
  backoff cannot be re-entered by another instance mid-publish.
- **Fails loudly, then gives up.** Failures back off exponentially and are
  recorded on the row. After `OUTBOX_MAX_ATTEMPTS` the row is dead-lettered with
  an error naming the aggregate, because an event nobody will ever deliver is
  worse than one that is visibly undelivered.

Delivery is **at-least-once**. Consumers deduplicate on `eventId`, which the
service generates if the caller does not supply one.

## Privacy

The outbox collection is not tenant-partitioned and is read by the relay, so it is
held to a tighter bar than the collections it mirrors. Payloads are checked
against a **per-event allowlist** at stage time, and anything outside it is
rejected with `BIZ_OUTBOX_EVENT_NOT_ALLOWLISTED` before the row is written.

The allowlist is deliberately narrow — identifiers, minor-unit amounts and
currency. No names, emails, applicant notes, evidence text, or free-text reasons.
An event is not the place to carry data that has a home; if a consumer needs
applicant details it fetches them by identifier, under its own authorization.

## Deployment requirement

MongoDB transactions require a **replica set**. On a standalone deployment,
`withTransaction` fails with `IllegalOperation: Transaction numbers are only
allowed on a replica set member or mongos`.

`ScholarshipTransactionRunner` does not pretend otherwise. It logs
`scholarship transaction degraded: …` once and re-runs `work` without a session,
so a single-node development or staging environment still functions — and the
reconcilers become load-bearing rather than defence-in-depth, because a crash
during a degraded write is no longer rolled back for you.

**This is a degraded mode, not a supported one.** The rollback guarantees this
change exists to provide do not apply there, and the logs say so on every
degraded write. Production must run a replica set. Treat the
`transaction degraded` log line as an alert, not a warning.

## Reconciliation

Because "impossible" is a claim about one deployment configuration, the invariants
are also checked independently, hourly:

- **`BudgetLedgerReconciler`** recomputes `reservedAmount`/`disbursedAmount` from
  the program's reservations and repairs the ledger when they disagree. A ledger
  whose totals exceed the recomputed values — an over-commit — is **reported but
  not repaired**: which award to unwind is a business decision, not something an
  unattended job should choose. Both cases emit
  `scholarship-finance.ledger.drift-detected`.

  A program with *no* reservations at all is a real answer, not an absent one: its
  ledger must be zero. Treating an empty aggregate as "nothing to check" left
  programs permanently reported as over-committed after their last reservation
  closed, blocking new awards.

- **`DisbursementReconciliationJob`** repairs an approved milestone with no
  payment eligibility, and an eligibility with no disbursement intent. The event
  listener is the fast path; this is the backstop, and it is safe to run on every
  instance at once because both repairs are idempotent.

## Operational notes

- **Relay throughput.** 200 rows per 10 seconds per instance, with up to 10
  consecutive full batches drained per tick. If `oldestPendingAgeMs` starts
  climbing, the relay is the bottleneck, not the producer.
- **Dead letters.** A dead-lettered row means an aggregate may never have been
  observed by its listeners. Replay it after fixing the listener; do not clear
  `deadLetteredAt` and hope.
- **Cron concurrency.** The award-expiry sweep catches per-award conflicts and
  continues. A lost race is a fact about the award, not a fault in the job — but a
  genuine failure is logged and the award stays `PENDING_ACCEPTANCE` so the next
  sweep retries it rather than skipping it.

## Why the outbox is a shared kernel, not a fifth context

`scholarship-outbox` owns no scholarship aggregate. It holds the transaction
runner and the outbox mechanism, and both `scholarships` and `scholarship` import
it. It may import shared infrastructure (`common/`, `events/`, Nest packages) and
must not import any of the four scholarship contexts.

That last rule is what stops the kernel becoming a back door into
`scholarship-finance`: without it, any context could reach finance through the
outbox without declaring the dependency it actually has, and the dependency
direction in
[ADR 0001](../../docs/adr/0001-scholarship-bounded-contexts.md) would be
unenforceable. `scholarship-context-acyclicity.spec.ts` asserts both halves of
this — the graph stays acyclic, and the kernel stays clean.
