# Mentorship Rollout & Migration Plan (MENTOR-120)

## Summary

The rollout and migration plan for taking ChainVerse's 1-on-1 mentorship
capability from today's code to general availability. It covers feature flags,
pilot tenants, data migrations, compatibility, monitoring, support readiness,
rollback triggers, and phased general availability.

This is the **Backend** implementation of shared work item **MENTOR-120**
(Operations track). It is a plan, not a code change: the mentorship domain model,
validated REST API, deny-by-default authorization, persistence and background
workflows already exist on `main` (see [What already exists](#what-already-exists)).
What is missing is the sequencing, the gates, and the honest statement of what
must be fixed before a pilot can be trusted.

Revalidated against `main` at `908155d` on 2026-10-17.

## What already exists

Track against the issue's "repository-specific delivery" so we do not rebuild it:

| Capability | Where |
| --- | --- |
| Domain model | `src/mentorship/schemas/` — programs, application forms & versions, eligibility rules & evaluations, match proposals, engagements, blocks, profiles, lifecycle |
| Validated REST API | `src/mentorship/{programs,forms,eligibility,review-queue}/`, `src/mentorship-applications/`, `src/mentorship-config/` |
| Authorization policy | `shared/mentorship-auth.guard.ts` + `@MentorshipPolicy()` — **deny-by-default**: a route with no policy is refused with `MENTOR_POLICY_MISSING` rather than opened |
| Persistence | Mongoose (`MentorshipModule`, `MentorshipLifecycleModule`, `MentorshipApplicationsModule`, `MentorshipConfigModule`) |
| Background workflows | `review-queue/mentorship-review-sweeper.service.ts`, `lifecycle/mentorship-lifecycle.service.ts`, `mentorship-decision-dispatcher.service.ts` |
| Idempotency | Unique indexes + in-document replay (`submissionKey`, `lastTransition`), plus the global `X-Idempotency-Key` interceptor |

## Gate 0 — must clear before any pilot

Nothing below can be validated until `main` compiles. Two defects make every
gate in this plan unmeasurable today.

### 0.1 `main` does not compile (merge corruption)

`npm run typecheck` fails with **638 syntax errors across 17 files**. All are
`import` blocks spliced into the middle of `@Module({ ... })` bodies or
duplicated identifiers — i.e. bad merge artifacts, not logic bugs:

| File | Errors |
| --- | --- |
| `src/mentorship/mentorship.module.ts` | 204 |
| `src/scholarships/controllers/scholarship-programs.controller.ts` | 97 |
| `src/scholarship-student-dashboard/scholarship-student-dashboard.controller.ts` | 71 |
| `src/config/app.config.ts` | 57 |
| `src/admin-course/admin-course.controller.ts` | 43 |
| `src/student-cart/student-cart.controller.ts` | 39 |
| `src/mentorship/programs/mentorship-programs.service.ts` | 39 |
| `src/student-saved-courses/student-saved-courses.controller.ts` | 21 |
| `src/organization/organization.controller.ts` | 20 |
| `src/metrics/metrics.service.ts` | 20 |
| `src/course-categorization-filtering/course-categorization-filtering.service.spec.ts` | 11 |
| `src/common/errors/domain.exception.ts` | 9 |
| `src/mentorship/programs/mentorship-programs.controller.ts` | 2 |
| `src/google-auth/google-auth.service.ts` | 2 |
| `src/mentorship/mentorship-telemetry.service.ts` | 1 |
| `src/student-enrollment/student-enrollment.service.spec.ts` | 1 |
| `test/role-access.e2e-spec.ts` | 1 |

`src/mentorship/mentorship.module.ts` is the worst case: four separate
`@Module` bodies (applications-track, MENTOR-035/036 submissions, matching,
and one more) were concatenated into one file, so `import` statements appear
*inside* decorator argument lists. It needs to be split back into the modules
it used to be, then re-wired in `app.module.ts` — which currently imports
`MentorshipModule` eight times.

**Owner:** backend maintainer. **Pass condition:** `npm run typecheck`,
`npm run build` and `npm test` are green on `main`. CI has been red on every
commit since at least `df1b177`; do not treat a red pipeline as "normal".

### 0.2 Two sources of truth for the `MENTORSHIP_ENABLED` default

The capability is supposed to be safe-by-default. It is not:

- `src/mentorship-config/mentorship-config.ts:45` — `bool(env, 'MENTORSHIP_ENABLED', false)`, and Joi agrees. **Default off.**
- `src/config/app.config.ts:178` — `process.env.MENTORSHIP_ENABLED !== 'false'`. **Default on.**

The kill switch reads the second one. `MentorshipAuthGuard` gates on
`configService.get('mentorship.enabled')`, and `MentorshipReviewSweeper` does
the same, so with the variable unset the guard does **not** trip and the routes
stay live. The safe `MentorshipConfigService.isEnabled()` is a parallel, unused
source of truth.

**Owner:** whoever owns `src/config/app.config.ts`. **Pass condition:** one
source of truth for `mentorship.enabled`, defaulting to **off**, and both the
guard and the sweeper read it. Until then, set `MENTORSHIP_ENABLED=false`
explicitly in every environment — do not rely on a default.

## Feature flags

Env-var flags, validated by Joi at boot (`src/common/config/env.validation.ts`),
read through `MentorshipConfigService`:

| Flag | Meaning | Default |
| --- | --- | --- |
| `MENTORSHIP_ENABLED` | Master kill switch for the capability | `false` (see Gate 0.2) |
| `MENTORSHIP_PAYMENTS_ENABLED` | Smart-contract-backed session payments | `false`, and **forced off** whenever `MENTORSHIP_ENABLED` is off |
| `MENTORSHIP_MAX_ACTIVE_MENTEES_PER_MENTOR` | Capacity bound | `10` |
| `MENTORSHIP_MAX_ACTIVE_ENGAGEMENTS_PER_MENTEE` | Capacity bound | `3` |
| `MENTORSHIP_SUPPORTED_CURRENCIES` | Settlement currencies | `USDC,XLM` |

Rules, matching the scholarships staged-rollout precedent:

- Flag checks are server-side only (guards/services), never trusted from client input.
- An unknown or missing flag is **disabled**, never enabled.
- Payments can never be enabled while the capability itself is off — this is
  already enforced in `buildMentorshipConfig`, and must not be weakened.
- Every flag change is recorded by the audit-log service with actor, old and new value.
- **No runtime (DB-backed) flag service is planned for GA.** Env flags keep the
  blast radius to a deploy and a restart, which is what a payments-adjacent
  capability wants. Cohort-scoped flags can be revisited post-GA.

## Pilot tenants

Pilots are staff-operated, one tenant at a time, each a deliberate gate:

1. **Staff-only dogfood.** `MENTORSHIP_ENABLED=true` in staging, then in
   production with programs in `draft`. Owners and admins only. No mentee
   signups, no payments. Proves boot, authz, and telemetry without exposure.
2. **Single closed cohort.** One real program, one staff tutor as mentor, two
   reviewers, a handful of invited mentees. `MENTORSHIP_PAYMENTS_ENABLED=false`
   — sessions are not paid during the pilot.
3. **Paid pilot.** Flip `MENTORSHIP_PAYMENTS_ENABLED=true` for the same cohort
   only. This is the first point at which funds or agreements exist, and the
   last gate before general availability.

Pilot success measures (explicit, measured at the end of each gate):

- Zero `MENTOR_POLICY_MISSING` / authorization-bypass events (a deny-by-default
  regression is an automatic stop).
- `mentorship_applications_submitted_total{result="success"}` completes without
  retry storms; idempotent replays never create a second document.
- Every engagement created has a matching proposal and a `termsHash`; no
  engagement without terms, no proposal without an expiry.
- No lifecycle record disagrees with its event log (sequence is contiguous).
- Support can answer "where is this mentee in the flow" from telemetry alone.

## Data migrations

Mentorship collections are **new and self-contained** — no existing collection is
rewritten — but three things must be true before the first paid pilot.

- **The migration runner must be wired up.** `scripts/migrate.ts` is a working,
  restartable runner (each migration is keyed by name and recorded in a
  `_migrations` collection, so it is safe to re-run on every deploy), but it has
  only two placeholder migrations and **no npm script**. Give it
  `npm run migrate` and run it in `deploy.yml` before the app boots.
- **Ignore the orphan.** `src/database/migrations/1727190000000-create-rendition-access-tokens.ts`
  is a TypeORM-style `MigrationInterface` file, but TypeORM is not a dependency.
  Delete it; do not let it look like a real migration path.
- **Build indexes ahead of time on large clusters.** Mongoose creates indexes on
  boot. On anything non-trivial set `autoIndex: false` and build the unique
  indexes as a migration instead, so a deploy cannot stall or time out.

Restartability and backward compatibility:

- Every migration is **additive** (new collection, new optional field, new index)
  or a backfill guarded by `{ field: { $exists: false } }`, so a re-run is a no-op
  and an older app version still reads the data.
- Migrations never delete or rename a field the running code still reads. Drop a
  field only in a later release, after no deployed version references it.
- Applications are never deleted; supersession is a link
  (`previousApplicationId` / `supersededByApplicationId`), so a rollback cannot
  orphan an application.
- A migration that touches payments-adjacent data (engagements, terms) must be
  **reversible** and must run behind `MENTORPAYMENTS_ENABLED=false`, so funds are
  never moved by a schema change.

## Compatibility

Rules for changing mentorship after this plan lands:

- Never change the meaning of an existing eligibility rule type; add a new type.
- Never edit a published application-form version; publish a new one.
- Never change the semantics of a lifecycle state or actor kind; add a new state.
- `termsHash` / `termsVersion` on proposals and engagements are the agreed-terms
  commitment. Terms are immutable once both parties approve; changing price or
  currency means a **new** proposal, not an edit.
- Adding a question type requires a matching frontend renderer before the first
  program uses it.

## Monitoring & operational telemetry

Existing counters to watch (low-cardinality labels only; never put a user id or
mentee content in a label):

| Signal | Why it matters |
| --- | --- |
| `mentorship_authz_denied_total{reason}` | `policy_missing` means a route lost its deny-by-default policy — treat as a stop-the-line event |
| `mentorship_preflight_total{outcome}` | Eligibility preflight health before submit |
| `mentorship_applications_submitted_total{result}` | Submission success vs `MENTOR_STALE_VERSION` vs validation failures |
| `mentorship_capacity_drift_total` | Capacity bounds not holding — a data-integrity signal |
| `mentorship_request_rejections_total{error_code}` | Stable error-code distribution for support |
| Lifecycle events (`MentorshipLifecycleEvent`, unique on `(mentorshipId, sequence)`) | A gap in `sequence` is a lost state change |

Structured domain events already exist (`mentorship.application.submitted`,
`mentorship.review.decided`, `mentorship.engagement-activated`,
`mentorship.application.withdrawn`) — carry the same identifiers across the
payments track so a mentee's flow can be reconstructed end to end.

## Support readiness

- **Runbook:** the existing `docs/mentorship/*.md` set is the runbook. Add a
  one-page "where is this mentee" decision tree keyed on lifecycle state.
- **Error vocabulary:** every mentorship error carries a stable code
  (`MENTOR_*`, `BIZ_*`, `RES_*`) rather than prose, so support can grep for it
  and the frontend can branch on it. Do not add a free-text error.
- **Support cannot act on funds.** Refunds and releases are a payments-track
  action; support escalates rather than mutating engagement records by hand.
- **A named on-call owner per pilot cohort**, agreed before the cohort opens.

## Rollback triggers & plan

Rollback is cheap and non-destructive by design, and must stay that way:

1. **Trigger = flip the flag, not delete data.** `MENTORSHIP_PAYMENTS_ENABLED=false`
   first (stops new paid activity), then `MENTORSHIP_ENABLED=false`. Both are
   env changes plus a restart.
2. **Nothing is deleted.** Collections are self-contained and versions are
   immutable, so disabling the flags leaves every application, proposal,
   engagement, agreement and lifecycle event exactly where it is. Re-enabling
   resumes precisely where things stopped.
3. **Funds and agreements are never orphaned.** This is the hard rule this plan
   exists to protect:
   - An engagement is only created from a proposal that both parties approved
     with the same `termsHash`; there is no code path that creates an engagement
     without terms.
   - `activeKey` is a **partial unique index in the database**, not a
     read-then-write check, so a concurrent rollback cannot mint a second active
     engagement for the same mentor/mentee/program.
   - Lifecycle updates use optimistic concurrency (`version`), so a rollback
     racing a state change loses cleanly instead of double-applying.
   - Payments release on withdrawal is **explicitly not implemented yet**.
     `mentorship.application.withdrawn` is emitted so a payments listener can
     react once the smart-contract flow exists. Until that listener exists, no
     withdrawal can strand funds, because no funds are held. Do not enable
     `MENTORSHIP_PAYMENTS_ENABLED` until that listener is built and tested.
4. **A rollback must be rehearsed** in staging at least once per paid-pilot gate.

Explicit stop-the-line triggers during any pilot:

- `mentorship_authz_denied_total{reason="policy_missing"} > 0` — deny-by-default regressed.
- Any lifecycle event log with a non-contiguous `sequence`.
- Any engagement with no matching proposal, or a `termsHash` mismatch.
- Any payment retry that produced a second effect.
- Typecheck/build/test red on `main` (see Gate 0).

## Phased general availability

| Phase | Flag state | Audience | Exit criteria |
| --- | --- | --- | --- |
| 0. Repair | n/a | none | Gate 0.1 and 0.2 cleared; CI green on `main` |
| 1. Dark deploy | `MENTORSHIP_ENABLED=false` | none | App boots; indexes built; no mentee-visible surface |
| 2. Staff dogfood | `enabled=true`, `payments=false` | staff | Authz, telemetry and idempotency hold; support runbook written |
| 3. Closed cohort | `enabled=true`, `payments=false` | invited mentees | Pilot success measures met; no capacity drift |
| 4. Paid pilot | `enabled=true`, `payments=true` | one cohort | Withdrawal-release listener live and tested; rollback rehearsed; no orphaned funds |
| 5. General availability | same, cohorts widened | all | Solvency/agreement integrity holds across cohorts; post-launch review done |

Each phase gate is approved by a **named owner** (backend maintainer for Gate 0,
product + support for phases 2–3, payments owner for phase 4) before the next
phase opens. A post-launch review is scheduled two weeks after phase 5.

## Privacy boundaries

- Eligibility rules can reference sensitive facts; evaluation results redact
  them, and `needs_information` questions are the only path back to the applicant.
- Telemetry carries identifiers only — never form answers, never mentee content.
- Evidence uploads are bounded (`MENTORSHIP_EVIDENCE_*`) with a retention window
  (`MENTORSHIP_EVIDENCE_RETENTION_DAYS`, default 365).
- The reviewer conflict-of-interest declaration is a privacy-sensitive record and
  is scoped to reviewers and leads.

## Dependencies & corresponding MENTOR-120 work in other repos

| Track | Where the work lives |
| --- | --- |
| Mentorship escrow / smart contracts | Stellar/Soroban — escrow created from `mentorship.engagement-activated` using `termsHash` as the agreed-terms commitment; release on `mentorship.session.completed`; refund path on `mentorship.application.withdrawn`. **This is the phase-4 blocker.** |
| Frontend | Mentor signup/availability, mentee discovery and shortlists, application form renderer, reviewer queue, and a mentee status view driven by lifecycle state |
| Operations | This plan; the runbook; the on-call roster per pilot cohort |

The withdrawal-release listener above is the single missing piece between the
current code and a real smart-contract-backed payment flow. Everything else it
needs (events, `termsHash`, engagement integrity) already exists.

## Test plan

Required by the issue's acceptance criteria and **not yet implemented**. Coverage
targets: success, validation, authorization, idempotency, and failure paths.

- **Unit**
  - `MentorshipAuthGuard`: deny-by-default (`MENTOR_POLICY_MISSING` on a route
    with no policy), 503 while the kill switch is off, role matching.
  - `buildMentorshipConfig`: `paymentsEnabled` forced off when `enabled` is off;
    every flag default; invalid values fall back rather than throwing.
  - Application transitions: supersession chain, withdrawal/reapply, and
    `lastTransition` replay writing the decision in the same update as the status flip.
  - Lifecycle machine: every state/actor transition; optimistic-concurrency
    race returns `ResourceConflict` instead of double-applying.
- **Integration (e2e, `mongodb-memory-server` as in `test/`)**
  - **Success:** submit → review → decide → match → activate an engagement with a
    `termsHash`.
  - **Validation:** oversized/malformed payloads, stale form version
    (`MENTOR_STALE_VERSION`), bad eligibility input.
  - **Authorization:** a student cannot reach admin/reviewer routes; a route with
    no policy is refused.
  - **Idempotency:** the same `Idempotency-Key` retried N times creates exactly one
    document; a reused key with a different body is rejected (`BIZ_IDEMPOTENCY_KEY_REUSED`).
  - **Failure:** concurrent lifecycle updates, a duplicate `activeKey`, and a
    rollback mid-flow leaving no orphaned engagement.
- **Module hygiene:** extend `src/__tests__/app-module-imports.spec.ts` so the
  mentorship module graph is asserted acyclic and each module is registered once
  (today `app.module.ts` imports `MentorshipModule` eight times).

## Consolidation follow-up (not a GA blocker, but tracked)

- **Three `MentorshipApplicationsService` implementations** exist:
  `src/mentorship-applications/`, `src/mentorship/applications/` and
  `src/mentorship/mentorship-applications.service.ts`. Consolidate to one.
- **Three mentorship top-level folders** (`mentorship/`, `mentorship-applications/`,
  `mentorship-config/`) violate the one-folder-per-domain rule in
  [module map](../module-map.md) — the very rule `mentorship/` is cited as
  exemplifying. Fold the two satellite modules into `mentorship/`.
- **No mentorship seed data** (`npm run seed` seeds only students and courses) and
  **no mentorship e2e spec** in `test/`.

## Follow-up

1. Clear Gate 0.1 (compile) and Gate 0.2 (single safe flag default) — owners above.
2. Wire `scripts/migrate.ts` to `npm run migrate` and `deploy.yml`; delete the
   orphan TypeORM migration file.
3. Build and test the withdrawal-release listener on the payments track; it is the
   phase-4 blocker.
4. Add the test-plan coverage above.
5. Get sign-off from each named owner before opening phase 2.
