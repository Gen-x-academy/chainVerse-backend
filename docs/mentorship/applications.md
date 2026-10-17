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
# Mentorship applications: decisions, withdrawal and reapplication

Backend implementation of **MENTOR-035** (structured application decisions)
and **MENTOR-036** (application withdrawal and reapplication), in the
Applications track. Code: [`src/mentorship/`](../../src/mentorship/).

## Endpoints

All routes need a bearer token. Writes marked with ✱ need an
`X-Idempotency-Key` header (8–128 chars of `A-Z a-z 0-9 - _ : .`).

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| POST | `/mentorship/programs` | tutor, admin | Create a program |
| GET | `/mentorship/programs/:programId` | any | Program and its policies |
| GET | `/mentorship/programs/:programId/applications` | program mentor, staff | Review queue (`?status=`) |
| POST ✱ | `/mentorship/programs/:programId/applications` | student | Apply |
| GET | `/mentorship/applications/mine` | student | Own applications |
| GET | `/mentorship/applications/:id` | applicant, program mentor, staff | Applicant or internal view |
| GET | `/mentorship/applications/:id/decisions` | applicant, program mentor, staff | Decision history |
| POST ✱ | `/mentorship/applications/:id/decisions` | program mentor, staff | Record a decision (MENTOR-035) |
| POST | `/mentorship/applications/:id/information-response` | applicant | Answer a request for information |
| GET | `/mentorship/applications/:id/withdrawal-preview` | applicant | Consequences + confirmation token (MENTOR-036) |
| POST ✱ | `/mentorship/applications/:id/withdraw` | applicant | Withdraw (MENTOR-036) |
| POST ✱ | `/mentorship/applications/:id/reapply` | applicant | Reapply (MENTOR-036) |

OpenAPI: every route, DTO field, header and stable error code is documented in
Swagger under **Mentorship Applications** (`/api/docs`).

## State machine

```mermaid
stateDiagram-v2
    [*] --> submitted
    submitted --> accepted: accept
    submitted --> rejected: reject
    submitted --> waitlisted: waitlist
    submitted --> information_requested: request_information
    information_requested --> submitted: applicant responds
    information_requested --> accepted: accept
    information_requested --> rejected: reject
    information_requested --> waitlisted: waitlist
    waitlisted --> accepted: accept
    waitlisted --> rejected: reject
    waitlisted --> information_requested: request_information
    submitted --> withdrawn: withdraw
    information_requested --> withdrawn: withdraw
    waitlisted --> withdrawn: withdraw
    accepted --> withdrawn: withdraw (before cutoff)
    rejected --> [*]
    withdrawn --> [*]
```

The table lives in
[`domain/application-transitions.ts`](../../src/mentorship/domain/application-transitions.ts).
Anything not listed is refused with `BIZ_MENTORSHIP_INVALID_TRANSITION`; a
withdrawn application refuses every action with
`BIZ_MENTORSHIP_APPLICATION_WITHDRAWN`, a rejected one with
`BIZ_MENTORSHIP_APPLICATION_CLOSED`.

## MENTOR-035 — structured decisions

A decision carries:

| Field | Visible to applicant | Notes |
| --- | --- | --- |
| `type` | yes | `accept`, `reject`, `waitlist`, `request_information`, `withdraw` |
| `applicantReasonCode` | yes | Coarse enum (`capacity_reached`, `strong_fit`, …) |
| `applicantMessage` | yes | Optional, ≤ 2000 chars |
| `internalReasonCode` | **no** | `scoring_threshold`, `conflict_of_interest`, … |
| `internalNote` | **no** | Optional, ≤ 5000 chars |
| `effectiveAt` | — | Defaults to now; future allowed, past refused |
| `communicationPolicy` | — | `notify_immediately`, `notify_at_effective_time`, `silent` |
| `expectedVersion` | — | Optional optimistic-concurrency check |

- **History is immutable.** `mentorship_application_decisions` rejects every
  update/delete operation at the schema level (same pattern as
  `audit_logs`). Each entry has a per-application `sequence`, unique-indexed.
- **Effective time.** Until `effectiveAt`, the applicant view shows the status
  from before the decision and hides the decision. A future decision cannot use
  `notify_immediately`.
- **Accept reserves a seat** with a conditional `$inc` against `capacity`; when
  full the request fails with `BIZ_MENTORSHIP_CAPACITY_REACHED` and the
  reviewer can waitlist instead.
- **Withdraw via this endpoint is staff-only** (acting on the applicant's
  request). Mentors cannot withdraw applicants.

## MENTOR-036 — withdrawal and reapplication

### Withdrawal

1. `GET …/withdrawal-preview` returns what will happen — review stops, record
   kept, whether a held seat is released, and whether / when reapplication is
   possible — plus a `confirmationToken` bound to the application's current
   version.
2. `POST …/withdraw` with `acknowledgeConsequences: true` and that token. If the
   application changed in between (e.g. a decision landed), the token no longer
   matches and the request fails with
   `BIZ_MENTORSHIP_WITHDRAWAL_CONFIRMATION_STALE`, so the applicant always
   confirms the consequences that actually apply.

Effects: status → `withdrawn`, `withdrawnAt`/`closedAt` set, a `withdraw`
decision appended to history, any held seat released exactly once (the release
is gated on the same conditional status update), and the application leaves the
"one active application per program" index. Nothing is deleted. After the
program's `withdrawalCutoffAt`, withdrawal fails with
`BIZ_MENTORSHIP_WITHDRAWAL_CUTOFF_PASSED`.

### Reapplication

`POST /mentorship/applications/:id/reapply` creates a **new** application:

- linked both ways — `previousApplicationId` on the new one,
  `supersededByApplicationId` on the old one (set conditionally, so only one
  reapplication per closed application can ever succeed) — plus
  `rootApplicationId` and `attemptNumber` for the whole chain;
- motivation and goals may be carried over;
- **consent is never copied.** The request must include
  `consent: { accepted: true, version }` and `version` must equal the program's
  current `consentVersion`.

Program policy (`reapplication.mode`, `cooldownHours`, `maxAttempts`):

| Mode | Reapply allowed after |
| --- | --- |
| `not_allowed` | never |
| `after_withdrawal` (default) | a withdrawal |
| `after_any_closure` | a withdrawal or a rejection |

Refusals: `BIZ_MENTORSHIP_REAPPLICATION_NOT_PERMITTED`,
`BIZ_MENTORSHIP_REAPPLICATION_COOLDOWN` (message includes the earliest time),
`BIZ_MENTORSHIP_REAPPLICATION_LIMIT_REACHED`,
`BIZ_MENTORSHIP_ALREADY_REAPPLIED`, `BIZ_MENTORSHIP_PROGRAM_CLOSED`,
`BIZ_MENTORSHIP_CONSENT_VERSION_MISMATCH`.

## Authorization

Deny by default:

- The controller's class-level `@Roles(Role.ADMIN)` applies to any handler that
  does not declare its own roles, so a new route is admin-only until opened up
  on purpose.
- Every service method then checks the resource against the JWT subject:
  **applicant** = `role === student` and `applicantId === sub`; **reviewer** =
  the program's own mentor (`role === tutor` and `mentorId === sub`) or staff
  (`admin`, `moderator`). Everyone else gets 403
  `AUTH_INSUFFICIENT_PERMISSIONS`.
- No DTO carries an applicant or actor id; identity always comes from the token
  (see [resource ownership](../security/resource-ownership.md)).

## Idempotency and concurrency

- Keys are stored on the records they create (`submissionKey` on applications;
  `idempotencyKey` + `requestHash` on decisions, unique per application), not
  in the 24 h response cache, so a retry is answered from the source of truth.
- Same key and same body → original result with `replayed: true`. Same key and
  a different body → 409 `BIZ_MENTORSHIP_IDEMPOTENCY_KEY_REUSED`.
- Every transition is a conditional update on `{status, version}`; a lost race
  returns 409 `BIZ_MENTORSHIP_STALE_VERSION`.
- On replica sets the seat change, status update, decision insert and outbox
  insert share one transaction. On standalone MongoDB they run as guarded
  steps: the application stores the decision it is about to insert in
  `lastTransition`, so a retry after a crash finishes the insert instead of
  deciding twice.

## Background workflow

Applicant notifications go through an outbox
(`mentorship_decision_notifications`, unique on `decisionId`).
`MentorshipDecisionDispatcher` runs every 30 s, claims due rows with a 2-minute
lease, and writes an in-app notification via `NotificationService`. Failed rows
retry up to 5 times. Delivery is at-least-once; the notification metadata
includes `decisionId` for de-duplication. `notify_at_effective_time` rows are
not due until `effectiveAt`; `silent` decisions create no row.

Domain events for other modules (e.g. sessions, payments):
`mentorship.application.decided`, `mentorship.application.withdrawn`,
`mentorship.application.reapplied`. Payloads carry ids and statuses only.

## Telemetry

OpenTelemetry counters (no-op until a meter provider is registered), mirrored
as structured log lines:

| Metric | Attributes |
| --- | --- |
| `mentorship_application_decisions_total` | `type`, `from_status`, `to_status`, `actor_kind` |
| `mentorship_idempotent_replays_total` | `operation` |
| `mentorship_request_rejections_total` | `operation`, `error_code` |
| `mentorship_seat_releases_total` | — |
| `mentorship_reapplications_total` | — |
| `mentorship_decision_notifications_total` | `outcome` |

Privileged writes are also recorded in the immutable audit log:
`mentorship_program.created`, `mentorship_application.decided`,
`mentorship_application.withdrawn`, `mentorship_application.reapplied`.

## Privacy boundaries

- Internal reason codes, internal notes, actor identity, the concurrency
  `version` and the seat reservation are never returned to applicants. The last
  two are hidden because they change when a not-yet-effective decision is
  recorded and would reveal it.
- The notification outbox, domain event payloads and telemetry attributes
  contain no internal reasons and no applicant free text (the outbox carries
  only the applicant-visible message).
- Audit entries record internal reason codes for staff review but not the
  free-text internal note.

## Dependencies

- MongoDB; a replica set is recommended for the transactional path.
- `ScheduleModule.forRoot()` — currently registered by `StellarModule`. If that
  module is removed, register it in `AppModule` or the dispatcher stops.
- `NotificationModule`, `AuditModule` (global), `EventEmitterModule`.
- JWT payloads must carry `sub` and `role`.

## Rollout

1. Deploy: the four collections and their indexes are created by Mongoose on
   boot. No existing data is migrated.
2. Enable on a replica set first, so the transactional path is the one in use.
3. Create programs only once the frontend MENTOR-035/036 screens ship; until
   then the API is reachable but unused.
4. Watch `mentorship_request_rejections_total` by `error_code` and the
   dispatcher's `failed` count after launch.
5. Rollback: remove `MentorshipModule` from `AppModule`. Records persist and
   are picked up again on re-enable; pending outbox rows resume dispatch.

Not yet in scope: escrow/payment release on withdrawal. Withdrawal emits
`mentorship.application.withdrawn` so a payments listener can react once the
smart-contract payment flow exists.

## Corresponding work in other ChainVerse repositories

- **Frontend — MENTOR-035:** reviewer decision form (reason codes, internal
  note, effective time, communication policy) and the applicant timeline that
  only shows effective decisions.
- **Frontend — MENTOR-036:** withdrawal preview/confirm dialog driven by
  `withdrawal-preview`, and a reapply form that always asks for consent again.
- **Smart contracts — MENTOR-036:** releasing or refunding any escrowed
  mentorship payment when an accepted application is withdrawn, triggered from
  the `mentorship.application.withdrawn` event.
# Mentorship applications (MENTOR-030 / MENTOR-031)

Backend implementation of the **Applications** track:

- **MENTOR-030**: create mentorship applications (draft → submit)
- **MENTOR-031**: autosave application drafts

Code lives in [`src/mentorship-applications/`](../../src/mentorship-applications/).

## API

All routes require a bearer token. OpenAPI docs are at `/api` (non-production).

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/mentorship/programs/:programId/application-form` | student, admin, moderator | Current (accepted) form version |
| `POST` | `/mentorship/programs/:programId/application-form` | admin | Publish a new form version |
| `POST` | `/mentorship/applications` | student | Start a draft (`Idempotency-Key` optional) |
| `GET` | `/mentorship/applications?programId=` | student | List my applications / resumable drafts |
| `GET` | `/mentorship/applications/:id` | student | Load a draft to resume |
| `PATCH` | `/mentorship/applications/:id/draft` | student | Autosave (partial, revision-guarded) |
| `POST` | `/mentorship/applications/:id/rebase` | student | Move a draft to the current form version |
| `POST` | `/mentorship/applications/:id/submit` | student | Submit (`Idempotency-Key` optional) |
| `DELETE` | `/mentorship/applications/:id` | student | Discard a draft |

## Lifecycle and guarantees

```
POST /applications ──► draft ──PATCH /draft (autosave)──► draft ──POST /submit──► submitted
                         │                                                          (immutable)
                         └──DELETE──► (removed)
```

**Draft and submit are separate.** Drafts can be partial. Completeness is only checked on submit: goals, expectations, schedule, preferred mode, consent for the form's `consentVersion`, and every required question. Missing items come back in `details.missingFields`.

**One active application.** A partial unique index on `(menteeId, programId)` where `active = true` blocks a second draft or submitted application for the same program. The index holds even when two requests race.

**Accepted form version.** Each draft records the `formVersion` it was written against. Submit is rejected with `BIZ_FORM_VERSION_OUTDATED` if an admin has published a newer version since then. The client calls `/rebase`, which drops answers to removed questions, and the mentee reviews the draft before submitting again.

**Atomic submit.** Submission is one conditional update on `status = draft AND revision = <reviewed revision>`. A concurrent autosave or a duplicate submit cannot interleave with it.

**Submitted applications are immutable.** Autosave, rebase and discard all return `409 BIZ_APPLICATION_NOT_DRAFT` once an application is submitted.

### Autosave and conflict handling

Every write bumps an integer `revision`, which acts as the revision token. The server also tracks, for each field, the revision and timestamp of its last change (`fieldUpdatedAt`). Answers are tracked per question as `answers:<key>`.

The client sends only the changed fields, plus the `baseRevision` it last saw:

- **Same base:** the change applies and `revision` goes up by one.
- **Stale base, different fields:** another device edited other fields. The edits merge.
- **Stale base, same field, different value:** `409 BIZ_DRAFT_REVISION_CONFLICT`. `details.conflicts[]` lists each field with the server's value and timestamp. **Nothing is overwritten.** The client shows both versions and saves again with the new `currentRevision`.
- **Stale base, same field, same value:** not a conflict. It is treated as a no-op.

The write itself is a compare-and-swap on the revision that was read. If a concurrent write lands between the read and the write, the server re-reads and checks again, up to three attempts.

Successful saves return `revision`, `lastSavedAt`, `fieldUpdatedAt` and `savedFields`, so the UI can show "Saved at …".

### Idempotency and offline recovery

- **Autosave:** each save can carry a client-generated `saveId`. The last 50 receipts are stored on the draft. Replaying a `saveId` returns the current draft with `replayed: true` and does not apply the change again. Clients can therefore queue saves while offline and replay them safely on reconnect. A queued save whose fields changed elsewhere in the meantime comes back as a conflict, not as a silent overwrite.
- **Create:** an `Idempotency-Key` is stored as `creationKey`, with a unique index on `(menteeId, creationKey)`. A retry returns the same draft. Reusing a key for a different program returns `BIZ_IDEMPOTENCY_KEY_REUSED`.
- **Submit:** an `Idempotency-Key` is stored as `submissionKey`. A retry, or a concurrent duplicate, returns the submitted application with `replayed: true`. The submitted event is emitted only once.

## Authorization (deny by default)

- **Applications controller:** guarded at class level by `JwtAuthGuard` and `RolesGuard` with `@Roles(STUDENT)`. Every query filters on `menteeId = req.user.id`. Another user's application returns the same `404` as an unknown id, so its existence is not revealed.
- **Forms controller:** every handler declares its roles explicitly. Only admins can publish.
- **Known issue:** on current `main`, [`src/common/decorators/roles.decorator.ts`](../../src/common/decorators/roles.decorator.ts) contains controller code instead of the `Roles` decorator and `ROLES_KEY`. This affects every module that uses `@Roles`. Fix it before rollout, or role checks will not compile or apply.

## Error codes

All errors use the standard error envelope. Some also include a `details` object.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `RES_MENTORSHIP_FORM_NOT_FOUND` | 404 | Program has no current form (not accepting applications) |
| `RES_MENTORSHIP_APPLICATION_NOT_FOUND` | 404 | Unknown id or not yours |
| `BIZ_ACTIVE_APPLICATION_EXISTS` | 409 | Already have an active application; `details.applicationId` |
| `BIZ_DRAFT_REVISION_CONFLICT` | 409 | Stale revision; `details.currentRevision`, `details.conflicts` |
| `BIZ_APPLICATION_NOT_DRAFT` | 409 | Application was already submitted |
| `BIZ_APPLICATION_INCOMPLETE` | 422 | `details.missingFields` |
| `BIZ_FORM_VERSION_OUTDATED` | 422 | Rebase required; `details.currentFormVersion` |
| `BIZ_IDEMPOTENCY_KEY_REUSED` | 422 | Key already used for a different request |
| `VAL_INVALID_REVISION` | 400 | `baseRevision` is ahead of the server |
| `VAL_UNKNOWN_FORM_FIELD` | 400 | Answer key is not on the draft's form version |

## Background workflow and telemetry

- **Event:** on submit, `mentorship.application.submitted` (`DomainEvents.MENTORSHIP_APPLICATION_SUBMITTED`) is emitted. The payload contains identifiers only. Matching, notifications and payment escrow should subscribe to this event rather than poll.
- **Logs:** structured events from `MentorshipApplicationsTelemetry`, all under the `mentorship.application.*` prefix:
  - `draft_created`
  - `draft_saved` (with `attempts` and `replayed`)
  - `draft_conflict` (with conflicting field **names**)
  - `draft_rebased`
  - `draft_discarded`
  - `submitted`
  - `rejected` (with `errorCode`)
  - `mentorship.application_form.published`

## Privacy boundaries

- Application content (goals, expectations, schedule, answers) is readable only by the mentee who owns it through this API. No mentor or admin read endpoint exists yet. Add one as a separate, explicitly authorized route.
- Logs and events never contain mentee-entered text, only ids, revisions, counts and field names.
- Consent records `consentVersion` and a server-set `acceptedAt`, so consent can be audited per form version.

## Dependencies

- MongoDB. Indexes are defined in the schemas and built by Mongoose on startup. In production, build them ahead of time if `autoIndex` is disabled.
- `JwtAuthGuard` and `RolesGuard` from `src/common`. See the roles decorator known issue above.
- `EventEmitterModule` (registered globally in `AppModule`).

## Rollout considerations

1. Fix the `roles.decorator.ts` breakage on `main`.
2. Deploy. The new collections are `mentorship_applications` and `mentorship_application_forms`. The partial unique indexes must exist before traffic arrives.
3. An admin publishes a form version for each program. Programs without a current form reject new applications with `RES_MENTORSHIP_FORM_NOT_FOUND`, which works as a per-program feature switch.
4. Release the frontend autosave client: debounce saves, send `saveId`, keep an offline queue, and add a conflict-resolution UI.

Publishing a form is not transactional. For a moment between the two updates, a program can have no current form, and a create in that window returns 404. Clients should retry once.

## Corresponding work in other ChainVerse repositories

- **Frontend, MENTOR-030:** application form UI, draft and submit flow, a completeness checklist driven by `missingFields`.
- **Frontend, MENTOR-031:** debounced autosave with `saveId`, an offline queue, a "last saved" indicator from `lastSavedAt`, and a conflict-resolution UI from `details.conflicts`.
- **Smart contracts:** nothing is required at the application stage. Payment escrow starts after a match, triggered from the `mentorship.application.submitted` workflow.
