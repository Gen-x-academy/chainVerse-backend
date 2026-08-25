# Course curriculum: sections, lessons and transactional reordering

Covers the persistence models added for #857 and the reorder operation added
for #858.

## Why a dedicated model

A course document holds high-level metadata. The legacy `course.curriculum`
array had no stable identifiers, so a client could only refer to an item by its
position — which is exactly the value a reorder changes. Sections and lessons
now live in their own collections with their own `_id`s: position moves,
identity does not.

## Collections

### `course_sections`

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | Stable section identifier |
| `courseId` | ObjectId | Indexed |
| `title` | string | Required, ≤ 200 chars |
| `description` | string \| null | ≤ 2000 chars |
| `order` | number | Zero-based position within the course |

Unique index: `{ courseId, order }`.

### `lessons`

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | Stable lesson identifier |
| `courseId` | ObjectId | Denormalized so a course's lessons load without a join |
| `sectionId` | ObjectId | Owning section |
| `title` | string | Required, ≤ 200 chars |
| `order` | number | Zero-based position within the section |
| `contentUnits` | ContentUnit[] | Ordered, ≤ 50 per lesson |
| `durationMinutes` | number | ≥ 0 |
| `isPreview` | boolean | Free preview outside enrollment |
| `status` | `draft` \| `published` | |

Unique index: `{ sectionId, order }`.

### Content units

A content unit is one piece of lesson content. `type` is validated against the
`ContentUnitType` enum and the payload must match it:

| `type` | Required payload |
| --- | --- |
| `video`, `file`, `link` | `url` |
| `article`, `quiz`, `assignment` | `body` |

A `video` without a `url` — or an `article` without a `body` — is rejected with
400 at the edge, so no half-formed unit reaches Mongo. Units are renumbered
contiguously from 0 on write, in the order submitted.

### `courses.curriculumVersion`

An integer on the course, incremented by every structural change (adding,
editing, deleting or reordering sections and lessons). It is the optimistic
concurrency token for the reorder endpoint. Courses written before this field
existed are treated as version `0`.

## API

All routes sit under `/courses/:courseId/curriculum` and require a bearer token
with role `tutor`, `admin` or `moderator`. A tutor may only touch courses they
own (`course.tutorId === jwt.sub`); admins and moderators may touch any course.
Every identifier in the path is validated by `ParseObjectIdPipe` and fails with
400 before Mongoose sees it.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Full outline plus `curriculumVersion` |
| `POST` | `/sections` | Append a section |
| `PATCH` | `/sections/:sectionId` | Edit section metadata |
| `DELETE` | `/sections/:sectionId` | Delete a section and its lessons |
| `POST` | `/sections/:sectionId/lessons` | Append a lesson |
| `PATCH` | `/lessons/:lessonId` | Edit lesson content |
| `DELETE` | `/lessons/:lessonId` | Delete a lesson |
| `PUT` | `/reorder` | Reorder the whole outline atomically |

Positions are never accepted on the create or update routes; adding appends to
the end, deleting closes the gap, and every other move goes through `/reorder`.

### `PUT /courses/:courseId/curriculum/reorder`

```json
{
  "expectedVersion": 4,
  "sections": [
    { "sectionId": "652f…a1", "lessonIds": ["652f…b2", "652f…b1"] },
    { "sectionId": "652f…a2", "lessonIds": [] }
  ]
}
```

The payload describes the **entire** outline in its new order. A lesson may
move between sections simply by being listed under a different one.

Responses:

| Status | Meaning |
| --- | --- |
| 200 | Applied; the body is the new outline with the incremented version |
| 400 | Payload is not a permutation of the stored outline, or an id is malformed |
| 403 | Caller does not own the course |
| 404 | Course does not exist (or is soft-deleted) |
| 409 | `expectedVersion` is stale — reload `GET /` and retry |

A partial list is **rejected, not merged**. Merging a partial list is what lets
two concurrent editors drop or duplicate a lesson; requiring the whole outline
makes the result independent of the order requests happen to arrive in.

## How atomicity is achieved

1. **Claim the version first.** A conditional
   `findOneAndUpdate({ _id, curriculumVersion: expectedVersion }, { $inc: … })`
   runs before anything moves. Two concurrent reorders built on the same
   version cannot both match, so exactly one proceeds and the other gets 409
   without having written anything.
2. **Stage, then land.** Every document is first parked at
   `1_000_000 + index`, then written to its final position. Doing it in one
   pass would trip the unique `{ parent, order }` indexes as soon as two
   documents swap places.
3. **One transaction.** All four bulk writes run inside a single MongoDB
   transaction when the deployment supports one, so readers never observe the
   staging positions.

### Standalone MongoDB

Transactions require a replica set. On a standalone server (single-node
development and test databases) the service logs a warning once and falls back
to running the same staged writes without a session. The version claim still
serializes concurrent reorders; what is lost is the all-or-nothing guarantee if
the process dies mid-write, so a best-effort rollback restores the previous
positions on failure.

**Run a replica set in production** — a single-member replica set is enough:

```yaml
command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
```

## Tests

* `src/curriculum/curriculum.service.spec.ts` — authorization, version claim
  ordering, payload validation, the staged write plan, transaction fallback and
  rollback.
* `test/curriculum.e2e-spec.ts` — real MongoDB: ordering, content-unit
  validation, gap closing, cross-tutor rejection, stale-version 409 and two
  concurrent reorders where exactly one wins.
