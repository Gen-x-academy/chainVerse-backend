# Issue #1298 — Implement Saved Mentor Shortlists (MENTOR-025)

## Context

ChainVerse provides 1-on-1 mentorship with smart-contract-backed payments. This document covers the backend implementation of shared work item **MENTOR-025** in the Discovery track.

**Audit baseline**
- Repository: `Gen-x-academy/chainVerse-backend`
- Audited branch: `main`
- Audited commit: `c268376358e465bb4676455485797a26cdd964e2`
- Audit date: 2026-10-16

> This spec must be revalidated against the latest `main` before implementation begins.

---

## Goal

Allow mentees to privately save, annotate, reorder, compare, and remove mentors — persisted across devices — without ever exposing those notes publicly.

---

## Functional Scope

| Capability | Description |
|---|---|
| Save mentor | Mentee adds a mentor to their private shortlist |
| Annotate | Mentee attaches a private note to a saved mentor |
| Reorder | Mentee sets a display order / priority rank |
| Compare | Shortlist can feed the comparison workflow (MENTOR-026) |
| Remove | Mentee removes a mentor; safe if the mentor account is deleted or hidden |
| Cross-device | Shortlist is server-persisted, not local-only |
| Privacy | Notes and shortlist membership are never exposed in public API responses |

---

## Domain Model

### `MentorShortlist`

Represents the mentee's overall shortlist container. One per mentee.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `menteeId` | UUID | FK → User; indexed; owner of the shortlist |
| `createdAt` | timestamptz | Set on creation |
| `updatedAt` | timestamptz | Updated on any change |

### `ShortlistedMentor`

One row per mentor saved to a shortlist.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `shortlistId` | UUID | FK → MentorShortlist |
| `mentorId` | UUID | FK → User (mentor); nullable-safe (mentor may be removed) |
| `note` | text \| null | Private annotation; never returned in public responses |
| `rank` | integer | Display order within the shortlist; default 0 |
| `savedAt` | timestamptz | When the mentor was first saved |
| `updatedAt` | timestamptz | Updated on note/rank change |

**Unique constraint:** `(shortlistId, mentorId)` — enforces idempotent saves.

---

## REST API

All endpoints require authentication. Authorization is deny-by-default — only the shortlist owner may read or mutate their own shortlist.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/mentees/me/shortlist` | Retrieve the caller's full shortlist |
| `POST` | `/mentees/me/shortlist/mentors` | Add a mentor (idempotent) |
| `PATCH` | `/mentees/me/shortlist/mentors/:mentorId` | Update note or rank |
| `DELETE` | `/mentees/me/shortlist/mentors/:mentorId` | Remove a mentor |

### Request / Response Shapes

**POST `/mentees/me/shortlist/mentors`**
```json
{
  "mentorId": "uuid",
  "note": "string (optional, private)",
  "rank": 0
}
```
Returns `201` on first save, `200` on duplicate (idempotent — no error, no duplicate row).

**PATCH `/mentees/me/shortlist/mentors/:mentorId`**
```json
{
  "note": "string | null",
  "rank": 1
}
```

**GET `/mentees/me/shortlist`** response
```json
{
  "mentors": [
    {
      "mentorId": "uuid",
      "rank": 0,
      "savedAt": "ISO-8601",
      "note": "string | null"
    }
  ]
}
```
> `note` is included only in the owner's own response. It must never appear in any shared or public mentor profile endpoint.

---

## Authorization Policy

- Every endpoint resolves the authenticated user's ID from the JWT.
- The shortlist is fetched by `menteeId = req.user.id`; no shortlist ID is accepted from the request body.
- Attempting to read or mutate another user's shortlist returns `403 Forbidden`.
- A mentor that has been deleted or hidden must be handled gracefully: the entry is retained with `mentorId` preserved, but the mentor's public profile data is omitted from the response (return a safe placeholder or omit the mentor from the list — document the choice).

---

## Persistence Notes

- Create the shortlist row lazily on first save, or eagerly on mentee account creation — document the chosen approach.
- Idempotency: use an upsert on `(shortlistId, mentorId)` or check-then-insert with a unique constraint violation handler.
- Rank gaps are acceptable; clients reorder by setting individual ranks, not by specifying a contiguous sequence.

---

## Background / Async Behavior

- No background job is strictly required for MVP.
- If mentor account deletion/deactivation events are published as domain events, subscribe to them to mark affected `ShortlistedMentor` rows (e.g., set a `mentorStatus` flag) so the API can filter or annotate accordingly.

---

## Acceptance Criteria

- [ ] Shortlists are owner-only; no other user or unauthenticated caller can access them.
- [ ] Saving the same mentor twice is idempotent — no duplicate rows, no error response.
- [ ] Removing a hidden or deleted mentor's entry does not throw.
- [ ] Private notes never appear in any public-facing API response.
- [ ] OpenAPI documentation is updated for all four endpoints.
- [ ] Unit and integration tests cover: success, validation errors, authorization denial, idempotent save, and failure paths.
- [ ] Retries do not duplicate effects (idempotency headers or upsert semantics).
- [ ] Errors are stable, typed, and actionable (no stack traces in production responses).
- [ ] Operational telemetry (structured logs / metrics) is added for shortlist mutations.

---

## Privacy Boundaries

| Data | Visibility |
|---|---|
| Shortlist existence | Owner only |
| `note` field | Owner only — must be excluded from all shared/public serializers |
| `rank` | Owner only |
| Mentor profile data within response | Public fields only, sourced from the mentor's public profile |

---

## Rollout Considerations

- The `mentor_shortlists` and `shortlisted_mentors` tables are new — no migration conflicts expected.
- Feature can be deployed behind a feature flag until fully tested.
- No breaking changes to existing mentor or mentee endpoints.

---

## Dependencies

| Dependency | Notes |
|---|---|
| Mentee auth / JWT | Caller identity must be resolvable from the token |
| Mentor user records | `mentorId` must reference existing user rows; deletion handling needed |
| MENTOR-025 (other repos) | Corresponding frontend work item in `chainVerse-frontend` |
| MENTOR-026 | The comparison workflow (Issue #1299) consumes the shortlist |

---

## References

- GitHub Issue: [#1298](https://github.com/Gen-x-academy/chainVerse-backend/issues/1298)
- Related: [#1299 — Mentor Comparison Workflow](https://github.com/Gen-x-academy/chainVerse-backend/issues/1299)
