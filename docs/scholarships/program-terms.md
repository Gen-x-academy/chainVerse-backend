# Scholarship Program Terms, Answer Validation, and Lifecycle States

Scholarships that award money, grants, or benefits are typically governed by
terms of participation that change over time (eligibility rules, deadlines,
award values, and obligations). This guide covers the versioning model for
scholarship program terms, how applicants accept a specific published revision,
how answers to application form fields are validated (issue #1132), and the
full program lifecycle state machine (issue #1122).

## Model overview

A **Scholarship Program** is a tenant-scoped container (owning `organizationId`)
that holds a series of **Program Terms Versions**. Each version is an
immutable snapshot of the terms in force; once published, its content can never
be edited — edits always produce a new revision.

The core status types:

- `ScholarshipProgramStatus` — `draft | published | paused | closed | archived`
- `TermsVersionStatus` — `draft | published | superseded`

A program always points at its **current published revision** via
`currentTermsVersionId` / `currentTermsVersionNumber`. When a new revision is
published, the previously published one is automatically marked `superseded`
and the program pointer moves to the new revision.

## Terms content and immutability

Each revision carries:

| Field            | Notes                                                            |
| ---------------- | ---------------------------------------------------------------- |
| `versionNumber`  | Monotonic, auto-incremented per program                          |
| `eligibility`    | Opaque eligibility rules                                         |
| `deadlines`      | Opaque deadline map                                              |
| `awardValue`     | Awarded amount (non-negative)                                    |
| `awardCurrency`  | ISO currency code (e.g. `USD`)                                   |
| `obligations`    | Award obligations, e.g. maintaining full-time enrollment         |

Content-bearing properties (`versionNumber`, `eligibility`, `deadlines`,
`awardValue`, `awardCurrency`, `obligations`) are marked **immutable** at the
schema level, so a published revision can never be silently mutated.

---

## Program lifecycle states (issue #1122)

### Status values

| Status      | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `draft`     | Program is being configured; not visible to applicants.           |
| `published` | Open for applications.                                            |
| `paused`    | Temporarily closed; no new applications accepted.                 |
| `closed`    | Applications permanently closed; no new submissions.             |
| `archived`  | Terminal state; program and data remain for auditing only.        |

### Legal transitions

```
DRAFT → PUBLISHED → PAUSED → PUBLISHED
                  ↓
                CLOSED → ARCHIVED
```

Any transition not listed above is rejected with `BIZ_PROGRAM_INVALID_TRANSITION`.
Archived programs are **immutable**; any attempt to transition them returns
`BIZ_PROGRAM_ARCHIVED`.

### Audit trail

Every transition is appended to `statusHistory` — an append-only array of
`{ status, changedBy, changedAt }` entries. The top-level fields
`statusChangedAt` and `statusChangedBy` mirror the most recent entry for
convenient access.

**Operational notes:**
- `statusHistory` grows with every state change. For programs with many
  pause/resume cycles, consider archiving old history entries to a secondary
  collection once the program is archived.
- Archived programs remain readable for audit queries forever.

**Ownership / privacy:** `statusHistory[].changedBy` is the JWT `sub` (user id)
of the internal staff member. It is not visible to applicants.

**Migration notes:** Pre-existing documents written with the old `open` status
value are *not* automatically renamed. Run
`scripts/migrate-scholarship-open-to-published.ts` to rename them to
`published`. Until the script is run, those documents will fail enum
validation on update (reads continue to work).

### Transition endpoint

```
PATCH /scholarships/programs/:programId/transition?organizationId=<org>
Body: { "status": "<target>" }
```

Requires `OWNER` or `ADMIN` role in the owning organization.

---

## Application form fields and answer validation (issue #1132)

### Form fields

A program may define an optional array of `formFields`, each specifying:

| Field        | Notes                                                              |
| ------------ | ------------------------------------------------------------------ |
| `_id`        | Stable ObjectId used as `fieldId` in application answers           |
| `label`      | Human-readable field label shown to applicants                     |
| `description`| Optional helper text                                               |
| `wordLimit`  | Max words for this field; `null` → use system default (500 words)  |
| `required`   | Whether a non-empty answer is mandatory                            |

**Client / server rule agreement:** The `wordLimit` value must be reflected
faithfully in the UI. The server enforces the same limit independently, so
client and server always agree.

### Answer DTO

```json
{
  "answers": [
    {
      "fieldId": "<ObjectId>",
      "value": "My answer text …",
      "wordCount": 12
    }
  ]
}
```

`wordCount` is optional and treated as a client hint. The server always
recomputes the count from `value` and rejects the answer if the server count
exceeds the limit.

### Server-side validation sequence

1. **Duplicate field ids** → `VAL_ANSWER_DUPLICATE_FIELD`
2. **Unknown field ids** (not in `program.formFields`) → `VAL_ANSWER_UNKNOWN_FIELD`
3. **Required fields with no answer** → `VAL_ANSWER_REQUIRED_FIELD_MISSING`
4. **Word count over limit** → `VAL_ANSWER_WORD_LIMIT_EXCEEDED`

Error messages include the array index path (e.g. `answers[2].value`) so
clients can surface the error at the correct form control. No internal schema
paths or database ids outside of `fieldId` are included in error messages.

### Stored answers

Validated answers are stored as embedded sub-documents in the application with
a server-computed `wordCount`. The count is stored for auditability and is not
recomputed after submission.

**Privacy:** Answers may contain applicant PII (personal statements,
background information). Treat the `answers` array as PII at rest and in
transit. Only the applicant and authorized org staff (OWNER/ADMIN/INSTRUCTOR)
may read them via the API.

**Migration:** The `answers` field defaults to `[]` on pre-existing
application documents, making the migration backward-compatible. No data
migration script is required.

---

## Workflow

1. **Create a program** — starts in `draft`. `POST /scholarships/programs`.
2. **Draft a revision** — `POST /scholarships/programs/:programId/terms`.
   Version numbers auto-increment (1, 2, 3, …). A revision stays a draft until
   explicitly published.
3. **Publish a revision** —
   `POST /scholarships/programs/:programId/terms/:versionId/publish`.
   This supersedes any previously published revision, moves
   `currentTermsVersionId` forward, and marks the program's terms as current.
4. **Publish the program** —
   `PATCH /scholarships/programs/:programId/transition` with `status: published`.
   Students can now apply.
5. **Apply** — `POST /scholarships/applications` with
   `acceptedTermsVersionId` equal to the **currently published** revision.
   Include `answers` for any form fields defined on the program.

## Applications

An application always references the published revision it was accepted under,
including a frozen snapshot of that revision's content:

- `acceptedTermsVersionId` / `acceptedTermsVersionNumber`
- `acceptedTermsSnapshot` — immutable copy of the terms at acceptance time
- `answers` — field answers validated against the program form at submission time

Application statuses follow `submitted → under_review → approved | rejected`,
plus `withdrawn` for an applicant who withdraws before a decision.

### Applicant routes

- `POST /scholarships/applications` — apply (student only)
- `GET /scholarships/applications/me` — list my applications
- `GET /scholarships/applications/:applicationId` — view one of mine
- `DELETE /scholarships/applications/:applicationId` — withdraw

### Reviewer routes (org staff)

- `GET /scholarships/programs/:programId/applications` — list applications
- `PATCH /scholarships/programs/:programId/applications/:applicationId` —
  approve / reject with an optional reason

## Tenant enforcement

All routes are organization-scoped. The guard reads the `organizationId` from
the request (`query` or `body`) and verifies the authenticated user is an
`OWNER`, `ADMIN`, `INSTRUCTOR`, or `MEMBER` of that organization before the
handler runs:

- Program **lifecycle management** (transitions, terms publishing) →
  `OWNER`, `ADMIN`
- Program **viewing** and **application review** →
  `OWNER`, `ADMIN`, `INSTRUCTOR`, `MEMBER`
- **Applying** / withdrawing → the authenticated `STUDENT` themselves

## Errors

Relevant error codes (see `src/common/errors/error-codes.enum.ts`):

**Resource:**
- `RES_SCHOLARSHIP_PROGRAM_NOT_FOUND`
- `RES_TERMS_VERSION_NOT_FOUND`
- `RES_SCHOLARSHIP_APPLICATION_NOT_FOUND`

**Validation (answer validation #1132):**
- `VAL_ANSWER_WORD_LIMIT_EXCEEDED`
- `VAL_ANSWER_UNKNOWN_FIELD`
- `VAL_ANSWER_REQUIRED_FIELD_MISSING`
- `VAL_ANSWER_DUPLICATE_FIELD`

**Business rules:**
- `BIZ_TERMS_VERSION_NOT_DRAFT` / `BIZ_TERMS_VERSION_NOT_PUBLISHED`
- `BIZ_PROGRAM_NOT_OPEN`
- `BIZ_PROGRAM_INVALID_TRANSITION` (lifecycle #1122)
- `BIZ_PROGRAM_ARCHIVED` (lifecycle #1122)
- `BIZ_APPLICATION_ALREADY_EXISTS`
- `BIZ_APPLICATION_NOT_REVIEWABLE` / `BIZ_APPLICATION_NOT_WITHDRAWABLE`
