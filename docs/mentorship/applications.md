# Mentorship applications (backend)

This document covers the backend implementation of the **Applications** track of ChainVerse 1-on-1 mentorship:

| Work item | Issue | Capability | Code |
| --- | --- | --- | --- |
| MENTOR-032 | #1309 | Configurable application questions | [`src/mentorship/forms`](../../src/mentorship/forms) |
| MENTOR-033 | #1311 | Eligibility preflight | [`src/mentorship/eligibility`](../../src/mentorship/eligibility) |
| MENTOR-034 | #1312 | Application review queues | [`src/mentorship/review-queue`](../../src/mentorship/review-queue) |

Supporting pieces: programs and reviewer scoping (`programs/`), submitted applications (`applications/`), and the shared guard, policy, audit and telemetry code (`shared/`).

All three items were revalidated against `main` at `5987416`, not the audit commit `c268376`. `main` had no mentorship code at all, so the module is new.

---

## 1. Model

```
MentorshipProgram ──< ProgramReviewer           (scoped reviewers: reviewer | lead, capacity)
        │
        ├──< ApplicationFormVersion             (draft → published; published = immutable)
        ├──< EligibilityRuleSet                 (every version immutable)
        └──< MentorshipApplication              (pins formVersion + ruleSetVersion)
                    ├──< ConflictDeclaration    (per reviewer)
                    └──< MentorshipAuditEvent   (append-only)
EligibilityEvaluation                           (preflight/submission records, TTL)
```

| Collection | Notes |
| --- | --- |
| `mentorship_programs` | `currentFormVersion` and `currentRuleSetVersion` only ever increase (`$max`). |
| `mentorship_program_reviewers` | Unique `(programId, reviewerId)`. `activeAssignments` is an atomic reservation counter. |
| `mentorship_form_versions` | Unique `(programId, version)`. A partial unique index allows only one draft per program. Model middleware scopes every update and delete to `status: 'draft'`. |
| `mentorship_eligibility_rule_sets` | Unique `(programId, version)`. Model middleware refuses all updates and deletes. |
| `mentorship_eligibility_evaluations` | Unique on the input fingerprint. TTL of 30 days for preflight and 365 days for submission. |
| `mentorship_applications` | Unique `(programId, applicantId)`. `version` is the optimistic-concurrency counter. One index exists per supported queue sort. |
| `mentorship_conflict_declarations` | Unique `(applicationId, reviewerId)`. |
| `mentorship_audit_events` | Append-only (enforced in middleware). An optional unique `dedupeKey` prevents duplicate rows when an action is retried. |

## 2. API

Every route requires `Authorization: Bearer <access token>` and is documented in Swagger at `/api` under the **Mentorship – …** tags.

### Programs and reviewers

| Method | Path | Who |
| --- | --- | --- |
| POST | `/mentorship/programs` (needs `X-Idempotency-Key`) | tutor, admin; the caller becomes the owner |
| GET | `/mentorship/programs/:programId` | anyone if `open`; otherwise owner, admin or scoped reviewer |
| PATCH | `/mentorship/programs/:programId` | owner, admin |
| GET | `/mentorship/programs/:programId/reviewers` | owner, admin, lead |
| PUT | `/mentorship/programs/:programId/reviewers/:reviewerId` | owner, admin (idempotent upsert of role, capacity and active flag) |

### MENTOR-032: forms

| Method | Path | Who |
| --- | --- | --- |
| GET | `…/forms/current` | applicants (program `open`), staff |
| GET | `…/forms/versions` | owner, admin, scoped reviewers |
| POST | `…/forms/versions` | owner, admin. Opens a draft seeded from the latest published version; returns the existing draft if one exists |
| GET | `…/forms/versions/:version` | owner, admin, scoped reviewers |
| PUT | `…/forms/versions/:version` | owner, admin. Body: `{ questions, expectedRevision }` |
| POST | `…/forms/versions/:version/publish` | owner, admin. Body: `{ expectedRevision }`. Idempotent |

**Question types:** `short_text`, `long_text`, `single_choice`, `multi_choice`, `number`, `boolean`, `date`, `url`, `email`.

Each question has `key`, `type`, `label`, optional `helpText`, `required`, a unique `order`, type-specific `validation` (`minLength`/`maxLength`, `min`/`max`/`integer`, `minSelections`/`maxSelections`), `options` (for choice types), and an optional `visibleWhen: { questionKey, operator: equals | not_equals | in | answered | not_answered, value? }`.

**Guarantees:**

- **Published versions are immutable.** Edits are rejected with `MENTOR_FORM_VERSION_IMMUTABLE`. The model layer also scopes every write to drafts, so a buggy caller cannot change a published version either.
- **Unsafe markup is rejected rather than sanitised.** Labels, help text and option labels are plain text. Tags, angle brackets, `javascript:` and `data:text/html` URLs, inline `on*=` handlers, template expressions, and control or bidi-override characters all return `MENTOR_UNSAFE_MARKUP` with field-level `details`.
- **Conditions are deterministic.** `visibleWhen` may only reference an *earlier* question, so the dependency graph cannot contain cycles. Evaluation is a single pass in canonical order (`order`, then `key`), and hidden questions count as unanswered. The result depends only on the questions and answers, never on the key order of the JSON.
- **Historical responses remain renderable.** An application stores its `formVersion` and normalised answers. `GET /mentorship/applications/:id` renders them against that exact version's labels and options, however many versions have been published since.

### MENTOR-033: eligibility

| Method | Path | Who |
| --- | --- | --- |
| POST | `…/eligibility/preflight` | any signed-in user. Body: `{ answers, formVersion?, ruleSetVersion? }` |
| GET | `…/eligibility/rules[/:version]` | owner, admin only (rules can be sensitive) |
| PUT | `…/eligibility/rules` | owner, admin. Body: `{ rules, expectedCurrentVersion }`. Creates a new immutable version; idempotent for identical content |

**Rule types:**

| Type | Params |
| --- | --- |
| `min_completed_courses` | `{ count }` |
| `completed_course` | `{ courseIds, match: any \| all }` |
| `max_active_applications` | `{ max }` |
| `answer_in` | `{ questionKey, values }` |
| `answer_number_range` | `{ questionKey, min?, max? }` |

A built-in `application_window` check (program status plus open and close dates) is always evaluated first.

Each rule carries a plain-text `publicMessage`, an optional `remediationUrl` (https, or a same-origin path), and a `sensitive` flag.

**Guarantees:**

- **Preflight matches submission enforcement.** Both call `MentorshipEligibilityService.evaluate()`, which runs the same pure `evaluateEligibility()` against the same server-derived facts and the program's current form and rule-set versions. Preflight uses *partial* answer mode, so missing required answers are reported in `missingRequiredQuestions` instead of being treated as errors. Submission uses strict mode.
- **Sensitive rules are not revealed.** Sensitive rules are reported only as `{ ruleId, outcome, message: <generic> }`, with no type, parameters or remediation link. Parameters are never returned to applicants for any rule. Facts such as completed courses come from the database; the client cannot supply them.
- **Stale inputs are handled.** The response contains `staleInputs` (`formVersion`, `ruleSetVersion`, `answers`) whenever the client's versions are out of date or it sent keys the current form does not have. `ignoredAnswerKeys` lists answers that were dropped. On submission, an outdated `formVersion` or `ruleSetVersion` returns **409 `MENTOR_STALE_VERSION`** with the current versions in `details`.
- **The evaluated rule version is recorded.** Responses include `evaluatedRuleSetVersion`. Each evaluation is stored in `mentorship_eligibility_evaluations` (versions, outcome and per-rule outcomes, plus a hash of the answers, never the answers themselves). Applications store `eligibility.ruleSetVersion`.
- **Outcomes:** `pass`; `fail` (any check failed); `needs_information` (a rule depends on a question the current form asks but the applicant has not answered). A rule that references a question the form does not contain **fails closed**.

### Applications

| Method | Path | Who |
| --- | --- | --- |
| POST | `/mentorship/programs/:programId/applications` | any signed-in user. Body: `{ formVersion, ruleSetVersion?, answers }` |
| GET | `/mentorship/applications/mine` | the applicant |
| GET | `/mentorship/applications/:applicationId` | the applicant (redacted view), owner, admin, or a non-conflicted scoped reviewer |

Submission rejects with `MENTOR_ELIGIBILITY_FAILED` or `MENTOR_ELIGIBILITY_NEEDS_INFORMATION` (422). The safe checks are returned in `details.checks`. A retry with identical answers returns the stored application with `created: false`. Different answers for an existing application return `MENTOR_ALREADY_APPLIED`.

### MENTOR-034: review queues

| Method | Path | Who |
| --- | --- | --- |
| GET | `/mentorship/review-queue` | staff (scoped) |
| GET | `/mentorship/review-queue/workload?programId=` | leads, owners and admins see every reviewer; reviewers see themselves |
| POST | `/mentorship/review-queue/:id/assignment` | self-claim (scoped reviewer), or assign others (lead, owner, admin). Body: `{ assigneeId?, expectedVersion }` |
| DELETE | `/mentorship/review-queue/:id/assignment` | the assignee, lead, owner or admin. Body: `{ expectedVersion }` |
| PATCH | `/mentorship/review-queue/:id/triage` | lead, owner, admin. Body: `{ priority?, dueAt?, expectedVersion }` |
| PUT | `/mentorship/review-queue/:id/conflict-declaration` | scoped reviewer. Body: `{ hasConflict, reason? }` (`reason` is required when `hasConflict` is true) |
| POST | `/mentorship/review-queue/:id/decision` | the assigned, conflict-cleared reviewer. Body: `{ outcome: accepted \| rejected \| waitlisted, note?, expectedVersion }` |
| GET | `/mentorship/review-queue/:id/audit` | lead, owner, admin |

**Queue filters:**

| Parameter | Values |
| --- | --- |
| `programId` | must be in your scope |
| `status` | `open` (default), `submitted`, `in_review`, `decided` |
| `priority` | comma-separated list of `low`, `normal`, `high`, `urgent` |
| `assignee` | `me`, `unassigned`, `any`, or a reviewer id (leads only, and only with `programId`) |
| `dueBefore` | ISO date |
| `overdue` | boolean |
| `coi` | your own status: `cleared`, `conflicted`, `undeclared` |
| `sort` | `priority` (default), `due`, `submitted` |
| `limit` | number of items per page |
| `cursor` | opaque value from the previous page |

**Guarantees:**

- **Only permitted applications appear.** The queue is limited to programs the caller owns or is an *active* scoped reviewer of; admins see all programs. Asking for a `programId` outside that scope returns 403. Queue rows never contain answers, and the applicant id is hidden from reviewers who declared a conflict.
- **Assignment is concurrency-safe.** First, the reviewer's capacity is reserved atomically (`$expr: activeAssignments < capacity`, then `$inc`). Second, the application is updated with a compare-and-set on `version` and the invariants (not decided, assignee not conflicted). If the second step loses a race, the reservation is released and the caller receives `MENTOR_ASSIGNMENT_CONFLICT` with the current version. On reassignment, the previous assignee's slot is released.
- **Conflicts block decisions.** A decision requires the decider to be the assignee *and* to have declared `hasConflict: false`. Otherwise the result is `MENTOR_COI_DECLARATION_REQUIRED` or `MENTOR_CONFLICT_OF_INTEREST`. The same invariants are repeated in the update filter, so a conflict declared concurrently still wins. A conflicted reviewer cannot be assigned, and declaring a conflict while assigned releases the assignment automatically.
- **Filters are stable.** Every sort ends with `_id`, so the order is total. Pagination is keyset-based and does not skip or repeat rows when new applications arrive. Cursors are bound to the viewer, sort and filters; reusing one with different filters returns `MENTOR_INVALID_CURSOR`.
- **Queue actions are audited.** Assign, reassign, unassign, triage, conflict declaration and decision each write an append-only audit row (actor, role, request id, from/to values, version). Retries are de-duplicated by `dedupeKey`.
- **Workload indicators:** `capacity`, `activeAssignments`, `availableSlots`, `overdueAssignments` and `utilization` per reviewer, plus the number of unassigned open and overdue applications for leads.

## 3. Cross-cutting behaviour

**Deny-by-default authorization.** `MentorshipAuthGuard`:

1. rejects any handler without `@MentorshipPolicy()` (`MENTOR_POLICY_MISSING`);
2. rejects every request while the kill switch is off;
3. authenticates the token;
4. checks the platform role.

`MentorshipAccessPolicy` then enforces program-level scope (admin, owner, active reviewer, lead) inside the services. Applicants only ever see their own applications. Unauthorised readers of an application receive 404, not 403, so its existence is not revealed.

**Retries do not duplicate effects.**

| Operation | Retry behaviour |
| --- | --- |
| Program create | `@Idempotent()` (`X-Idempotency-Key`) |
| Draft create, publish, rules publish, submission, assign, unassign, triage, conflict declaration, decide | Repeating an action already in effect is a no-op that returns `result: "noop"`, `created: false`, or the existing version |
| Preflight records | Upserted on the input fingerprint |
| Audit rows | De-duplicated by `dedupeKey` |

**Stable, actionable errors.** Every error has a stable `errorCode` (see `MENTOR_*` in [`error-codes.enum.ts`](../../src/common/errors/error-codes.enum.ts)) and, where useful, structured `details`, such as field issues, current versions or failed checks. `AllExceptionsFilter` now passes `details` through.

| Status | Codes |
| --- | --- |
| 400 | `VAL_INVALID_INPUT`, `MENTOR_INVALID_ANSWERS`, `MENTOR_UNSAFE_MARKUP`, `MENTOR_FORM_INVALID_DEFINITION`, `MENTOR_INVALID_CURSOR` |
| 401 | `AUTH_INVALID_TOKEN` |
| 403 | `AUTH_INSUFFICIENT_PERMISSIONS`, `MENTOR_ACCESS_DENIED`, `MENTOR_POLICY_MISSING`, `MENTOR_NOT_ASSIGNEE` |
| 404 | `MENTOR_PROGRAM_NOT_FOUND`, `MENTOR_APPLICATION_NOT_FOUND`, `MENTOR_FORM_NOT_FOUND`, `MENTOR_RULESET_NOT_FOUND` |
| 409 | `MENTOR_STALE_VERSION`, `MENTOR_FORM_VERSION_IMMUTABLE`, `MENTOR_ALREADY_APPLIED`, `MENTOR_ASSIGNMENT_CONFLICT`, `MENTOR_REVIEWER_AT_CAPACITY`, `MENTOR_CONFLICT_OF_INTEREST`, `MENTOR_COI_DECLARATION_REQUIRED`, `MENTOR_ALREADY_DECIDED` |
| 422 | `MENTOR_FORM_NOT_PUBLISHED`, `MENTOR_ELIGIBILITY_FAILED`, `MENTOR_ELIGIBILITY_NEEDS_INFORMATION`, `MENTOR_NOT_A_REVIEWER` |
| 503 | `SYS_SERVICE_UNAVAILABLE` (kill switch, or eligibility facts unavailable; safe to retry) |

**Background workflow.** `MentorshipReviewSweeper` runs every `MENTORSHIP_REVIEW_SWEEP_INTERVAL_MS` milliseconds. Each run:

- marks overdue open applications exactly once (an atomic `overdueNotifiedAt` update, so it is safe across instances) and emits `mentorship.review.overdue`;
- every tenth run, reconciles reviewer `activeAssignments` against the actual assignments, using conditional writes that never overwrite a concurrent reservation.

Domain events are also emitted for `mentorship.form.published`, `mentorship.ruleset.published`, `mentorship.application.submitted`, `mentorship.review.assigned` and `mentorship.review.decided`. Notification listeners can subscribe later; none are wired yet.

**Telemetry.** Counters are exposed through `/metrics` and `/metrics/prometheus`. Labels are low-cardinality only; no ids appear in labels.

| Counter | Labels |
| --- | --- |
| `mentorship_authz_denied_total` | `reason`, `action` |
| `mentorship_program_actions_total` | `action` |
| `mentorship_form_actions_total` | `action` |
| `mentorship_form_validation_failures_total` | `kind` |
| `mentorship_eligibility_rules_published_total` | – |
| `mentorship_preflight_total` | `outcome` |
| `mentorship_preflight_stale_inputs_total` | – |
| `mentorship_applications_submitted_total` | `result` |
| `mentorship_review_queue_reads_total` | `sort` |
| `mentorship_review_actions_total` | `action`, `result` |
| `mentorship_review_overdue_total` | – |
| `mentorship_review_sweeps_total` | `result` |
| `mentorship_workload_reconciled_total` | – |
| `mentorship_audit_write_failures_total` | `action` |

Request latency per route comes from the existing `MetricsInterceptor`. Structured logs use the `Mentorship` logger context.

Suggested alerts:

- `mentorship_audit_write_failures_total` > 0
- `mentorship_review_sweeps_total{result="error"}` rising
- a sustained `mentorship_review_overdue_total` rate

## 4. Privacy boundaries

| Data | Who can see it |
| --- | --- |
| Applicant answers | The applicant; the program owner and admins; scoped reviewers with no declared conflict. Never present in queue rows, audit metadata, telemetry or evaluation records (those store only a hash). |
| Eligibility rule params | Owner and admin only. Applicants see `publicMessage` and `remediationUrl` for non-sensitive rules, and a generic message for sensitive ones. |
| Conflict-of-interest reason | Stored only in `mentorship_conflict_declarations`. Never written to the audit log or telemetry, never shown to applicants or other reviewers. The list of who declared what is visible to owners, admins and leads only. |
| Decision note | Internal. The applicant view exposes only `outcome` and `decidedAt`. |
| Review state (assignee, priority, due date) | Staff only. Excluded from the applicant view. |

## 5. Dependencies

**Internal:**

| Dependency | Used for |
| --- | --- |
| `common/guards/jwt-auth.guard` | token verification |
| `common/errors` | `DomainException` and `ErrorCode` |
| `idempotency/` | the `@Idempotent()` interceptor |
| `metrics/` | `MetricsService.increment` (domain counters, added here) |
| `events/event-names` | domain event names |
| `student-enrollment/schemas/enrollment.schema` | completed-course facts |

**External:**

- MongoDB 4.4 or later (partial unique indexes, `$expr` in update filters, TTL indexes).
- No new npm packages; validation uses the already-installed `joi`.

**Configuration** (validated in `env.validation.ts`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `MENTORSHIP_ENABLED` | `true` | Kill switch. `false` makes every route return 503 and stops the sweeper. |
| `MENTORSHIP_REVIEW_SWEEP_INTERVAL_MS` | `60000` | Sweeper interval. `0` disables it. |
| `MENTORSHIP_DEFAULT_REVIEW_SLA_DAYS` | `7` | Default `reviewSlaDays` for new programs. |

**Known pre-existing issue:** `common/decorators/roles.decorator.ts` on `main` does not export `Roles` or `ROLES_KEY` (see [module map](../module-map.md), duplicate #10). The mentorship module therefore uses its own `@MentorshipPolicy()` and does not depend on `RolesGuard`.

## 6. Rollout

1. **Deploy dark.** Ship with `MENTORSHIP_ENABLED=false`. Mongoose builds the new indexes on start-up; on large clusters, build them ahead of time instead (`autoIndex: false` plus a migration). There is no data to migrate, because every collection is new.
2. **Internal pilot.** Set `MENTORSHIP_ENABLED=true`. Create one program owned by a staff tutor, publish a form and rules, and scope two reviewers. Keep the program in `draft` so applicants cannot see it; owners and admins can still dry-run preflight. The window check reports `fail` until the program is open, but every other check is evaluated normally.
3. **Open the program.** `PATCH status=open`. Watch `mentorship_preflight_total{outcome}`, the `eligibility_fail` share of `mentorship_applications_submitted_total{result}`, and the overdue and workload counters.
4. **Rollback.** Set `MENTORSHIP_ENABLED=false`. All data stays in place and versions are immutable, so re-enabling resumes exactly where things stopped.

**Compatibility rules for later changes:**

- Never change the semantics of an existing rule type; add a new type instead.
- Never edit a published form version; publish a new one.
- Adding a question type requires a matching frontend renderer before the first program uses it.

## 7. Corresponding MENTOR work in other ChainVerse repositories

| Item | Frontend (web app) | Smart contracts (Stellar/Soroban mentorship escrow) |
| --- | --- | --- |
| MENTOR-032 | Form builder UI (drag-to-order, typed fields, `visibleWhen` editor limited to earlier questions); a renderer that evaluates visibility with the same ordered-pass rule; text rendered as plain text; historical rendering from `form.version` | None. Forms are off-chain. |
| MENTOR-033 | Preflight panel before submit: show `checks` with remediation links, prompt for `needs_information` questions, refresh the form when `staleInputs` is non-empty; on submit, handle `MENTOR_STALE_VERSION` by reloading | None directly. Only the outcome gates later on-chain escrow creation. |
| MENTOR-034 | Reviewer queue (filters mapped 1:1 to query params, cursor paging), claim/assign with `expectedVersion` and refresh on 409, conflict-of-interest prompt before the decision form, workload widgets for leads | None. `mentorship.review.decided` with `accepted` is the hook for the later escrow and session-booking flow (payments track). |

Link the sibling issues for MENTOR-032, -033 and -034 in those repositories when the PR is opened.

## 8. Test plan (not yet implemented)

Automated tests were deliberately left out of this change. The following coverage is still needed to meet the issues' acceptance criteria:

- **Unit tests** for the pure domain functions:
  - `validateFormDefinition`: duplicates, backward-only conditions, unsafe markup.
  - `evaluateAnswers`: determinism under key reordering, hidden or unknown keys, every type.
  - `evaluateEligibility`: each rule type, the sensitive-rule redaction, fail-closed on missing questions.
  - `cursorFilter` and `encodeCursor`: round trip and mismatched filters.
- **Integration tests** (e2e with `mongodb-memory-server`, as in `test/`):
  - authorization denials for each route, including a handler without a policy;
  - idempotent replays of submit, publish, assign and decide;
  - racing claims, where exactly one wins and capacity is never exceeded;
  - decision blocked without a conflict-of-interest declaration;
  - stale `formVersion` and `ruleSetVersion` on submit;
  - preflight and submit agreeing for the same input;
  - sweeper overdue marking that happens exactly once.
