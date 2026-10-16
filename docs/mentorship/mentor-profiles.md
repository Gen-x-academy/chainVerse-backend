# Mentor professional profiles (MENTOR-008)

Backend implementation of the shared MENTOR-008 work item in the Identity track. Code lives in
`src/mentorship/mentor-profile/` and is registered through `MentorshipModule`.

## API

All routes require a signed-in user (`JwtAuthGuard`). The `me` routes act on the caller's own profile; there is no
user id to supply or tamper with.

| Method | Route | Purpose |
| --- | --- | --- |
| `PUT` | `/mentors/me/profile` | Save the draft. Full replace; omitted fields return to their defaults |
| `GET` | `/mentors/me/profile` | The draft, the published copy, and which fields publishing still needs |
| `POST` | `/mentors/me/profile/publish` | Publish a snapshot of the draft |
| `POST` | `/mentors/me/profile/unpublish` | Take the profile out of view; the draft is kept |
| `GET` | `/mentors/me/profile/revisions?limit=` | Change history, newest first (default 20, max 50) |
| `GET` | `/mentors/:profileId/profile` | Another user's published profile, permitted fields only |

## Fields and validation

Headline (120), biography (2000), expertise (up to 15 entries of 60), languages (up to 10 of 35), IANA time zone,
years of experience (0 to 80), teaching approach (1500), links (up to 8, `https` only) and visibility. Lengths and shapes are
always enforced; unknown fields are rejected. A draft may be partial. **Publishing** needs headline, biography, at least one
expertise, at least one language and a time zone; the error names what is missing
(`VAL_MENTOR_PROFILE_INCOMPLETE`). Lists are trimmed and de-duplicated case-insensitively.

## Draft, published copy and visibility

A profile holds a working `draft` and a `published` snapshot. Editing changes only the draft, so what viewers see changes
only when the owner publishes.

| `visibility` | Who sees the published profile |
| --- | --- |
| `public` | Any signed-in user |
| `members` | Any signed-in user (reserved for narrowing to program members) |
| `private` | The owner only |

Viewers get `id`, headline, biography, expertise, languages, time zone, experience, teaching approach and links. They never
get the owner's user id, email, visibility setting, draft, or revision data. A draft, an unpublished profile, a private
profile viewed by someone else and an unknown id all return the same `404`, so the response does not reveal that a hidden
profile exists.

## Idempotency and concurrency

- Saving the same draft again, publishing an unchanged published profile, and unpublishing an unpublished one are no-ops:
  no new revision and no revision-number change.
- Every effective change increments `revision` and writes one row to `mentor_profile_revisions`, which is unique on
  `(profileId, revision)`, so a replay cannot add a second row.
- Writes are guarded by the revision that was read. If another request changed the profile first, the response is `409`
  (`BIZ_MENTOR_PROFILE_CONFLICT`) and nothing is overwritten.
- Two simultaneous first saves are resolved by the unique index on `userId`.

## Auditing

`mentor_profile_revisions` is append-only: profile, user, revision number, action (`draft_saved`, `published`, `unpublished`),
a snapshot of the content after the change, and a timestamp. Owners can read their own history; nobody else can.

## Rollout

New collections `mentor_profiles` (unique index on `userId`) and `mentor_profile_revisions`. No existing data changes. If
`autoIndex` is off in an environment, create the indexes before enabling the routes.

## Dependencies and known gaps

- **Roles:** there is no mentor role yet. Any signed-in user can create a mentor profile; restricting this belongs with the
  mentorship role and permission matrix (MENTOR-003), which this does not assume.
- **Directory and matching:** listing or searching mentors is out of scope. A viewer needs a profile id.
- **Verification and trust indicators:** the identity verification workflow, credential checks and completion indicators
  are separate items (MENTOR-011 to MENTOR-014); this module exposes `missingForPublish` as the completeness measure.
- **Telemetry:** errors carry stable codes (`RES_MENTOR_PROFILE_NOT_FOUND`, `VAL_MENTOR_PROFILE_INCOMPLETE`,
  `BIZ_MENTOR_PROFILE_CONFLICT`); no new metrics are emitted.
- **Other repositories:** the matching MENTOR-008 work in the other ChainVerse repositories consumes these routes.
