# Program Lifecycle: Removal of the Legacy Direct Status Setter

Closes #1248.

`PATCH scholarships/programs/:programId/status` was labelled `deprecated` but
still called `ScholarshipProgramsService.setProgramStatus`, which wrote an
arbitrary `status` straight onto the program document:

```ts
// removed
async setProgramStatus(organizationId, programId, status) {
  await this.getProgram(organizationId, programId);
  return this.programModel.findOneAndUpdate(
    { _id: programId, organizationId },
    { $set: { status } },     // ← no state-machine check, no audit entry
    { new: true },
  );
}
```

That bypass was reachable by any organization `OWNER` or `ADMIN`, which made
three guarantees false at once:

1. **Illegal transitions were possible.** `draft → closed`, `closed → published`
   and `archived → published` all succeeded.
2. **A closed or archived program could be silently reopened.** Reopening is not
   a legal transition, and the applicant-facing "is this program open?" check
   reads `status`, so a reopened program started accepting applications again.
3. **No audit trail.** `statusHistory`, `statusChangedAt` and `statusChangedBy`
   were left untouched, so the change was invisible to auditors. This matters
   for sponsor and regulator reporting, which relies on that array.

## What changed

| Removed                                   | Replacement                              |
| ----------------------------------------- | ---------------------------------------- |
| `PATCH /scholarships/programs/:programId/status` | `PATCH /scholarships/programs/:programId/transition` |
| `ScholarshipProgramsService.setProgramStatus`     | `ScholarshipProgramsService.transitionProgramStatus` |
| `UpdateScholarshipProgramStatusDto`               | `TransitionProgramStatusDto`             |

`PATCH :programId/transition` is now the only route in the entire API that can
change a program's status.

## Migration plan for API clients

There is no response-compatibility shim: a `deprecated` flag does not stop a
client from calling the route, and a shim that still mutates state would keep
the bypass alive. The route is gone, so clients receive `404`.

| Step | Action                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 1    | Replace every call to `PATCH :programId/status` with `PATCH :programId/transition`. The body is identical (`{ "status": "<target>" }`). |
| 2    | Walk the lifecycle explicitly. The legacy route accepted any target; `transition` only accepts a target reachable from the current status. Sequence a program with `draft → published → closed → archived` instead of writing the final value directly. |
| 3    | Re-read the program (`GET :programId`) before retrying a `422`. `BIZ_PROGRAM_INVALID_TRANSITION` means the pair `(current, requested)` is not a legal transition — not that the payload is malformed. |
| 4    | Schedule any pending migration off the removed route before upgrading the server.                              |

The two error codes a client must now handle on this route are
`BIZ_PROGRAM_INVALID_TRANSITION` (illegal pair) and `BIZ_PROGRAM_ARCHIVED`
(terminal state). Neither existed on the legacy route.

### Sunset timeline

| Stage                                    | State                                                        |
| ---------------------------------------- | ------------------------------------------------------------ |
| Before this change                       | Route present, marked `deprecated`, unvalidated.              |
| This change (issue #1248)                | Route and service method removed. `transition` is the only writer. |
| Next major API version                    | `status` moves from "deprecated" to "reserved"; any reintroduction is a breaking change. |

If a downstream integration is still pinned to the removed route, it must be
re-pointed at `transition` before this change ships. There is no window in
which both routes are valid.

## API

### `PATCH /scholarships/programs/:programId/transition`

Authorization: `OWNER` or `ADMIN` of the owning organization, verified by
`OrganizationRolesGuard` against the `organizationId` query parameter.

```http
PATCH /scholarships/programs/66f1c0a2b3c4d5e6f7a8b9c0?organizationId=66f1c0a2b3c4d5e6f7a8b9c1
Authorization: Bearer <staff jwt>
Content-Type: application/json

{ "status": "published" }
```

Legal pairs:

```
draft     → published
published → paused | closed
paused    → published
closed    → archived
archived  → (none — terminal)
```

Success appends to `statusHistory` and stamps `statusChangedAt` /
`statusChangedBy`:

```json
{
  "_id": "66f1c0a2b3c4d5e6f7a8b9c0",
  "status": "published",
  "statusChangedAt": "2026-09-27T10:15:00.000Z",
  "statusChangedBy": "66f1c0a2b3c4d5e6f7a8b9d2",
  "statusHistory": [
    { "status": "published", "changedBy": "66f1c0a2b3c4d5e6f7a8b9d2", "changedAt": "2026-09-27T10:15:00.000Z" }
  ]
}
```

| Status | Code              | Meaning                                                     |
| ------ | ----------------- | ----------------------------------------------------------- |
| 404    | `RES_SCHOLARSHIP_PROGRAM_NOT_FOUND` | Absent, or owned by another tenant. Identical either way so program ids cannot be probed across organizations. |
| 403    | `AUTH_INSUFFICIENT_PERMISSIONS`     | Caller is not `OWNER`/`ADMIN` of that organization. |
| 422    | `BIZ_PROGRAM_INVALID_TRANSITION`    | `(current, requested)` is not a legal pair. |
| 422    | `BIZ_PROGRAM_ARCHIVED`              | Program is `archived`; it is immutable. |
| 422    | `BIZ_PROGRAM_INVALID_TRANSITION`    | Concurrent transition: the status changed between the read and the conditional write. Re-read and retry. |

## Data, privacy and operational impact

- **No schema or data migration.** The `statusHistory`, `statusChangedAt` and
  `statusChangedBy` fields already existed and are simply now the only path
  that writes them. Existing documents are untouched, so any `status` value
  written by the old route remains exactly as it is.
- **Existing ids preserved.** Nothing in this change rewrites `_id`, so
  application, award and terms-version references stay valid.
- **No privacy change.** No new field, no new read path, and no new personal
  data. `statusChangedBy` and `statusHistory[].changedBy` continue to hold
  staff user ids and remain staff-only — they are not exposed to applicants.
- **Audit completeness improves.** Programs whose status was changed through the
  legacy route have a status value with no corresponding `statusHistory` entry.
  Those gaps are historical and cannot be reconstructed; going forward every
  transition is recorded. Sponsors reading status history should expect
  pre-existing holes and should treat `status` as authoritative for the current
  value.
- **Operational risk: a program can no longer be force-reopened.** If an
  operator genuinely needs to reopen a `closed` program, the correct path is to
  create a new program revision, or to have the state machine changed
  deliberately (adding a `closed → published` edge to
  `PROGRAM_STATUS_TRANSITIONS`, with a matching test and audit note). Editing
  the database directly is no longer a supported shortcut because the platform
  will treat the status and the history as inconsistent.

## Regression coverage

`src/scholarships/__tests__/scholarship-programs.service.spec.ts`

- `does not expose an unvalidated status setter on the service` — the only
  status-related method on the prototype is `transitionProgramStatus`.
- `rejects reopening a CLOSED program` — no write is attempted.
- `rejects every transition out of ARCHIVED` — all five target values, including
  `published`.
- `rejects skipping a lifecycle step (DRAFT → CLOSED)`.
- `records the actor and timestamp in the append-only history`.
- `reports a conflict when a concurrent transition already moved the program` —
  the conditional write matches nothing and surfaces `BIZ_PROGRAM_INVALID_TRANSITION`.
- `refuses to transition a program owned by another tenant`.

`src/scholarships/__tests__/scholarship-programs.controller.spec.ts`

- `registers no direct program status route` — walks Nest's `PATH_METADATA` /
  `METHOD_METADATA` for every handler and asserts nothing ends in `/status`.
- `exposes exactly one route that can change a program status` — the complete
  list of non-`GET` routes, so a new unvalidated writer cannot be added quietly.
- `routes every status change through the validated transition endpoint`.
- `keeps the transition handler bound to the validating service method` — the
  handler forwards `organizationId`, `programId`, target status and the actor's
  JWT `sub` to `transitionProgramStatus`.
