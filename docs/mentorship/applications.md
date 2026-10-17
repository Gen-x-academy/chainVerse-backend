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
