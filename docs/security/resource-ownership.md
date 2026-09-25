# Resource ownership for student-scoped records

Addresses #852.

## The problem

Generic id-based CRUD handlers authenticate the caller and then act on whatever
record the path points at. Any authenticated student could read or mutate
another student's row simply by putting a different `:id` in the URL — the token
was checked, the ownership of the target never was.

Two modules were built that way: `student-account-settings` and
`student-certificate-name-change-request`.

## The rule

**Identity comes from the JWT, never from the request.** No DTO carries a
`studentId`, and no handler derives an owner from the path. The owner is always
`jwt.sub`, stamped server-side on create and re-checked on every read and write.

The shared helpers live in [`src/common/auth/resource-owner.ts`](../../src/common/auth/resource-owner.ts):

| Helper | Rule |
| --- | --- |
| `assertOwnerOrStaff(ownerId, actor, resource)` | Owner, admin or moderator |
| `assertOwner(ownerId, actor, resource)` | Owner only — staff get no exemption |
| `isStaff(actor)` | `admin` or `moderator` |

A cross-account attempt fails with **403 Forbidden**. An id that does not exist
fails with **404 Not Found**, and a malformed id fails with **400** before
reaching Mongoose.

## Account settings — `/student/account-settings`

Records are Mongo-backed (`student_account_settings`), one row per student,
with a unique index on `studentId`.

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/` | Staff only — full listing |
| `GET` | `/me` | Student — own row, created with defaults on first read |
| `PATCH` | `/me` | Student — own row |
| `POST` | `/` | Student — own row |
| `GET` | `/:id` | Owner or staff |
| `PATCH` | `/:id` | **Owner only** — staff may read but not rewrite preferences |
| `DELETE` | `/:id` | Owner, or staff for account closure |

## Certificate name change requests — `/student/certificates/name-change-request`

Records are Mongo-backed (`certificate_name_change_requests`) with a
`pending → approved | rejected` lifecycle.

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/` | Staff only; optional `?status=` filter |
| `GET` | `/me` | Student — own requests |
| `POST` | `/` | Student — filed under `jwt.sub`; one pending request at a time |
| `GET` | `/:id` | Owner or staff |
| `PATCH` | `/:id` | **Owner only**, and only while `pending` |
| `POST` | `/:id/review` | **Staff only** — approve or reject, recording the reviewer |
| `DELETE` | `/:id` | Owner while `pending`, or staff at any time |

A student cannot decide their own request: `status`, `reviewedBy`, `reviewedAt`
and `decisionNote` are not part of any student-writable DTO.

## Breaking changes

Both modules previously stored `{ title, description, metadata }` in memory and
issued UUID ids that their own `ParseObjectIdPipe`-guarded routes then rejected.
They now persist real domain fields; the old payload shape is gone.

Route changes: the staff listing (`GET /`) is now admin/moderator only, `TUTOR`
no longer has access to either resource, and `/me` plus `/:id/review` are new.

An unregistered duplicate of the name-change module under
`src/admin-auth/student-certificate-name-change-request/` was removed. It mapped
to the same route path with none of these checks, so wiring it up would have
silently reopened the hole.

## Tests

* `src/student-account-settings/*.spec.ts` and
  `src/student-certificate-name-change-request/*.spec.ts` — controller and
  service level, including staff exemptions and the owner-only writes.
* `test/student-resource-ownership.e2e-spec.ts` — a valid token for student A
  against student B's records over real HTTP: 403 on read, update and delete,
  and a body-supplied `studentId` that changes nothing.
