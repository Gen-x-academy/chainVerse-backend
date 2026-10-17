# Issue #1299 — Create Mentor Comparison Workflow (MENTOR-026)

## Context

ChainVerse provides 1-on-1 mentorship with smart-contract-backed payments. This document covers the backend implementation of shared work item **MENTOR-026** in the Discovery track.

**Audit baseline**
- Repository: `Gen-x-academy/chainVerse-backend`
- Audited branch: `main`
- Audited commit: `c268376358e465bb4676455485797a26cdd964e2`
- Audit date: 2026-10-16

> This spec must be revalidated against the latest `main` before implementation begins.

---

## Goal

Enable a mentee to compare a limited set of mentors side-by-side across normalized dimensions so they can make an informed booking decision.

---

## Functional Scope

| Dimension | Notes |
|---|---|
| Expertise / skills | Normalized tag list; categories must be comparable across mentors |
| Languages | Spoken / teaching languages |
| Availability | Weekly slot availability; missing values must be shown explicitly, not omitted |
| Delivery mode | e.g., video, async, hybrid |
| Price | Hourly or session rate in a common currency unit |
| Trust signals | Verified badges, review count, average rating — only verified signals, no invented ranks |
| Selections persist | A mentee's active comparison selection is saved server-side |
| Mobile-friendly | Response shape must work on small screens (compact field names, no deeply nested objects) |

Missing values must be represented explicitly (e.g., `null` or an `"unknown"` sentinel) — they must never be omitted or silently defaulted in a way that makes one mentor appear better than another.

---

## Domain Model

### `MentorComparison`

Stores the mentee's current comparison selection. One active comparison per mentee at a time.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `menteeId` | UUID | FK → User; unique index (one comparison per mentee) |
| `mentorIds` | UUID[] | Ordered list; max length enforced (recommended: 4) |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | Updated on every selection change |

**Constraint:** `mentorIds` must not exceed the configured maximum (default 4). Enforced in the service layer, not only the DB.

---

## REST API

All endpoints require authentication. Authorization is deny-by-default.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/mentees/me/comparison` | Retrieve the current comparison selection and normalized mentor data |
| `PUT` | `/mentees/me/comparison` | Replace the comparison selection (full replace, idempotent) |
| `POST` | `/mentees/me/comparison/mentors` | Add a single mentor to the selection |
| `DELETE` | `/mentees/me/comparison/mentors/:mentorId` | Remove a mentor from the selection |

### Request / Response Shapes

**PUT `/mentees/me/comparison`**
```json
{
  "mentorIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```
- Replaces the selection atomically.
- Returns `400` if `mentorIds` exceeds the max length or contains duplicates.

**POST `/mentees/me/comparison/mentors`**
```json
{
  "mentorId": "uuid"
}
```
- Returns `409` if the max comparison size would be exceeded.
- Idempotent if the mentor is already in the selection.

**GET `/mentees/me/comparison`** response
```json
{
  "mentorIds": ["uuid-1", "uuid-2"],
  "mentors": [
    {
      "mentorId": "uuid-1",
      "displayName": "string",
      "expertise": ["Solidity", "Rust"],
      "languages": ["English", "Spanish"],
      "availability": {
        "weeklySlots": 5,
        "timezone": "UTC+1"
      },
      "deliveryModes": ["video", "async"],
      "pricing": {
        "currency": "USD",
        "ratePerHour": 80
      },
      "trustSignals": {
        "verified": true,
        "reviewCount": 42,
        "averageRating": 4.8
      }
    }
  ]
}
```

All fields that cannot be resolved must appear as `null`, not be omitted. No composite "score" or invented rank is returned.

---

## Normalization Rules

To make mentors meaningfully comparable, the backend must normalize data before returning it:

| Dimension | Normalization |
|---|---|
| Expertise | Map raw skill tags to a canonical taxonomy; unknown tags passed through as-is |
| Languages | ISO 639-1 codes normalized to display names |
| Availability | Slots counted per week in the mentor's configured timezone |
| Delivery mode | Lowercase, consistent enum values: `video`, `audio`, `async`, `hybrid` |
| Price | All rates expressed per hour in the platform's base currency; conversion applied if needed |
| Trust signals | Only computed from verified review data; `reviewCount: 0` is valid and returned explicitly |

---

## Authorization Policy

- The comparison is fetched by `menteeId = req.user.id`; no comparison ID is accepted from the client.
- Attempting to read or mutate another user's comparison returns `403 Forbidden`.
- Only public mentor profile fields are included in the comparison response — no private mentor data is exposed.

---

## Persistence Notes

- One `MentorComparison` row per mentee; use upsert semantics on `menteeId`.
- `mentorIds` stored as a UUID array (PostgreSQL `uuid[]`) or as a JSON column depending on the project's ORM conventions.
- Selection persists until the mentee replaces or clears it; no automatic expiry at MVP.

---

## Background / Async Behavior

- If a mentor is deleted or deactivated between the time the selection is saved and the GET is called, the mentor's data fields must return `null` values with a `"status": "unavailable"` indicator rather than throwing a 404.
- No background jobs required at MVP; mentor data is resolved at read time.

---

## Acceptance Criteria

- [ ] Missing values are explicit (`null`) — no field is silently omitted to make a mentor appear better.
- [ ] Categories are comparable: all mentors' expertise, languages, and delivery modes use the same normalized vocabulary.
- [ ] No misleading rank or composite score is invented or returned.
- [ ] Selections persist server-side and survive page reloads / device switches.
- [ ] Response shape works on small screens (flat structure, no deeply nested objects beyond one level).
- [ ] Max comparison size is enforced server-side.
- [ ] OpenAPI documentation is updated for all four endpoints.
- [ ] Unit and integration tests cover: success, validation, authorization denial, max-size enforcement, idempotency, and failure paths.
- [ ] Retries do not duplicate effects.
- [ ] Errors are stable, typed, and actionable.
- [ ] Operational telemetry is added for comparison mutations.

---

## Privacy Boundaries

| Data | Visibility |
|---|---|
| Comparison selection | Owner only |
| Mentor profile fields in response | Public fields only |
| Mentor private data (contact details, notes, etc.) | Must not appear in comparison response |

---

## Rollout Considerations

- New `mentor_comparisons` table — no migration conflicts expected.
- Can be deployed behind a feature flag until the frontend comparison UI (MENTOR-026 frontend) is ready.
- Max comparison size (`4`) should be configurable via environment variable to allow adjustment without a redeploy.

---

## Dependencies

| Dependency | Notes |
|---|---|
| Mentee auth / JWT | Caller identity must be resolvable from the token |
| Mentor public profiles | Source of expertise, availability, pricing, trust signal data |
| MENTOR-025 / Issue #1298 | Shortlists feed the comparison — mentors can be selected from a saved shortlist |
| MENTOR-026 (other repos) | Corresponding frontend work in `chainVerse-frontend` |
| Currency normalization service | Required if mentors price in different currencies |

---

## References

- GitHub Issue: [#1299](https://github.com/Gen-x-academy/chainVerse-backend/issues/1299)
- Related: [#1298 — Saved Mentor Shortlists](https://github.com/Gen-x-academy/chainVerse-backend/issues/1298)
