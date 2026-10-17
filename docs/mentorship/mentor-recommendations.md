# Issue #1302 — Recommend Mentors with Explainable Matching (MENTOR-028)

## Context

ChainVerse provides 1-on-1 mentorship with smart-contract-backed payments. This document covers the backend implementation of shared work item **MENTOR-028** in the Discovery track.

**Audit baseline**
- Repository: `Gen-x-academy/chainVerse-backend`
- Audited branch: `main`
- Audited commit: `c268376358e465bb4676455485797a26cdd964e2`
- Audit date: 2026-10-16

> This spec must be revalidated against the latest `main` before implementation begins.

---

## Goal

Rank eligible mentors for a mentee using declared goals, expertise, language, schedule overlap, delivery mode, and program constraints, and return human-readable reasons for each recommendation so mentees understand why a mentor was surfaced.

---

## Functional Scope

| Signal | Notes |
|---|---|
| Declared goals | Mentee's stated learning objectives matched against mentor expertise |
| Expertise | Tag overlap between mentee skill targets and mentor skill tags |
| Language | Shared spoken / teaching languages |
| Schedule overlap | Overlap between mentee availability windows and mentor weekly slots |
| Delivery mode | Match between mentee preferred mode and mentor offered modes |
| Program constraints | Mentor's active program capacity, eligibility rules, cohort timing |
| Human-readable reasons | Each recommendation includes a plain-language explanation of contributing factors |
| Dismissal | Mentee can dismiss a recommendation; dismissed mentors are excluded from future results |
| Protected traits | Race, gender, religion, nationality, and other protected characteristics must never be used as ranking features |
| Ineligible exclusion | Mentors who do not meet program constraints are excluded before ranking |

---

## Domain Model

### `MentorRecommendation`

One row per recommendation surfaced to a mentee. Used to track impressions, dismissals, and feedback.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `menteeId` | UUID | FK → User (mentee) |
| `mentorId` | UUID | FK → User (mentor) |
| `score` | numeric | Internal ranking score; **never returned to the client** |
| `reasons` | jsonb | Array of human-readable reason strings |
| `dismissed` | boolean | `true` if the mentee dismissed this recommendation |
| `dismissedAt` | timestamptz | Nullable; set when dismissed |
| `generatedAt` | timestamptz | When the recommendation was computed |
| `expiresAt` | timestamptz | When the recommendation should be regenerated |

**Constraint:** `(menteeId, mentorId)` unique — one active recommendation per mentee-mentor pair.

### `MenteeGoal`

Stores the mentee's declared goals used as matching input.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `menteeId` | UUID | FK → User; unique (one goal profile per mentee) |
| `skillTargets` | string[] | Skills the mentee wants to develop |
| `preferredLanguages` | string[] | ISO 639-1 codes |
| `preferredModes` | enum[] | `video`, `audio`, `async`, `hybrid`, `in_person` |
| `availabilityWindows` | jsonb | Weekly time windows in the mentee's timezone |
| `updatedAt` | timestamptz | |

---

## REST API

All endpoints require authentication. Authorization is deny-by-default.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/mentees/me/recommendations` | Retrieve ranked mentor recommendations |
| `POST` | `/mentees/me/recommendations/:mentorId/dismiss` | Dismiss a recommendation |
| `DELETE` | `/mentees/me/recommendations/:mentorId/dismiss` | Undo a dismissal |
| `PUT` | `/mentees/me/goals` | Update the mentee's declared goals (drives re-ranking) |
| `GET` | `/mentees/me/goals` | Retrieve the mentee's current declared goals |

### Response Shape — `GET /mentees/me/recommendations`

```json
{
  "recommendations": [
    {
      "mentorId": "uuid",
      "displayName": "string",
      "expertise": ["Solidity", "DeFi"],
      "languages": ["English", "French"],
      "deliveryModes": ["video", "async"],
      "availability": {
        "weeklySlots": 4,
        "timezone": "UTC+1"
      },
      "reasons": [
        "Matches your Solidity learning goal",
        "Shares English as a teaching language",
        "Has 4 open slots that overlap with your availability"
      ],
      "dismissed": false
    }
  ],
  "generatedAt": "ISO-8601",
  "expiresAt": "ISO-8601"
}
```

**Key constraints on the response:**
- The internal `score` is **never returned** to the client.
- `reasons` must identify contributing factors in plain language.
- Protected attributes (race, gender, nationality, religion, etc.) must never appear in `reasons` or be used in ranking logic.
- Dismissed recommendations are excluded by default; include `?includeDismissed=true` to show them.

### Request Shape — `PUT /mentees/me/goals`

```json
{
  "skillTargets": ["Solidity", "Rust", "ZK Proofs"],
  "preferredLanguages": ["en", "es"],
  "preferredModes": ["video", "async"],
  "availabilityWindows": [
    { "dayOfWeek": "monday", "startTime": "09:00", "endTime": "12:00", "timezone": "UTC+1" }
  ]
}
```

Updating goals triggers recommendation regeneration (async or lazy on next fetch — document the chosen approach).

---

## Matching Algorithm

The matching algorithm must be deterministic, auditable, and bias-free.

### Eligible Mentor Filter (applied before ranking)

A mentor is excluded from results if any of the following are true:
- Mentor has no published programs with available seats.
- Mentor's program eligibility rules exclude this mentee (e.g., prerequisite not met).
- Mentor's cohort timing has no upcoming start date.
- Mentor has been previously dismissed by this mentee (unless `?includeDismissed=true`).

### Ranking Signals (allowed)

| Signal | Weight | Reason surfaced |
|---|---|---|
| Skill tag overlap | High | "Matches your [topic] learning goal" |
| Language match | Medium | "Shares [language] as a teaching language" |
| Schedule overlap | Medium | "[N] open slots overlap with your availability" |
| Delivery mode match | Low | "Offers [mode] delivery, which you prefer" |
| Program fit | Medium | "Has an upcoming cohort with available seats" |

Weights should be configurable via environment variables to allow tuning without redeployment.

### Prohibited Signals

The following must **never** be used as ranking features or appear in reason strings:

- Race, ethnicity, or national origin
- Gender or gender identity
- Religion or belief
- Age (beyond program-stated prerequisites)
- Disability status
- Any attribute not explicitly listed in the allowed signals above

---

## Authorization Policy

- Recommendations are fetched by `menteeId = req.user.id`; no mentee ID is accepted from the client.
- Attempting to read or mutate another user's recommendations returns `403 Forbidden`.
- Only public mentor profile fields are included in the recommendation response — no private mentor data is exposed.
- Dismissal endpoints validate that the target `mentorId` belongs to a recommendation owned by the caller.

---

## Persistence Notes

- Recommendations are generated lazily on first fetch or eagerly via a background job — document the chosen approach.
- Stale recommendations (past `expiresAt`) are regenerated on next fetch or by a scheduled job.
- Dismissals are soft-deleted: the row is retained with `dismissed = true` so the history is preserved for abuse detection.
- Goal updates invalidate the current recommendation set; set `expiresAt = now()` on goal change to force regeneration.

---

## Background / Async Behavior

| Trigger | Action |
|---|---|
| Mentee updates goals | Invalidate and queue recommendation regeneration |
| Mentor updates availability or program | Re-score affected mentee recommendations |
| Program seat status changes | Re-filter mentors whose seat availability changed |
| Scheduled job (configurable interval) | Refresh recommendations approaching `expiresAt` |

---

## Acceptance Criteria

- [ ] Ineligible mentors (no seats, eligibility mismatch, no upcoming cohort) are excluded before ranking.
- [ ] Each recommendation includes at least one human-readable reason identifying contributing factors.
- [ ] Protected traits (race, gender, religion, nationality, etc.) are not used as ranking signals and do not appear in reason strings.
- [ ] Dismissed recommendations are excluded from default results; `?includeDismissed=true` surfaces them.
- [ ] Dismissal is idempotent; dismissing the same mentor twice returns the same result without error.
- [ ] Undo dismissal restores the recommendation to active status.
- [ ] Internal ranking score is never returned in any API response.
- [ ] Updating goals triggers recommendation regeneration.
- [ ] OpenAPI documentation is updated for all five endpoints.
- [ ] Unit and integration tests cover: success, eligibility exclusion, ranking signal coverage, bias-free signal validation, dismissal, undo dismissal, goal update, authorization denial, idempotency, and failure paths.
- [ ] Retries do not duplicate effects.
- [ ] Errors are stable, typed, and actionable.
- [ ] Operational telemetry is added for recommendation generation, dismissals, and goal updates.

---

## Privacy Boundaries

| Data | Visibility |
|---|---|
| Recommendation list | Owner (mentee) only |
| Internal `score` | Never returned to any client |
| Mentee's declared goals | Owner only |
| Dismissal history | Owner only; retained for abuse detection |
| Mentor profile fields in response | Public fields only |
| Protected attribute data | Must not be stored or used in ranking |

---

## Rollout Considerations

- New tables: `mentor_recommendations`, `mentee_goals` — no migration conflicts expected.
- Ranking weights should be configurable via environment variables before launch.
- Deploy recommendation generation as a background job first, then enable the API endpoint behind a feature flag.
- The algorithm must be reviewed for bias before enabling for all users — document the review process and sign-off.
- No breaking changes to existing mentor or mentee endpoints.

---

## Dependencies

| Dependency | Notes |
|---|---|
| Mentee auth / JWT | Caller identity must be resolvable from the token |
| Mentor public profiles | Source of expertise, availability, language, and mode data |
| Mentorship programs | Source of seat availability, eligibility, and cohort timing |
| MENTOR-025 / Issue #1298 | Shortlists — recommended mentors can be saved |
| MENTOR-026 / Issue #1299 | Comparison — recommended mentors can be compared |
| MENTOR-027 / Issue #1301 | Program catalog — eligibility and seat data sourced from here |
| MENTOR-028 (other repos) | Corresponding frontend work in `chainVerse-frontend` |
| MENTOR-029 / Issue #1304 | Abuse and scraping controls apply to this recommendation surface |

---

## References

- GitHub Issue: [#1302](https://github.com/Gen-x-academy/chainVerse-backend/issues/1302)
- Related: [#1298 — Saved Mentor Shortlists](https://github.com/Gen-x-academy/chainVerse-backend/issues/1298)
- Related: [#1299 — Mentor Comparison Workflow](https://github.com/Gen-x-academy/chainVerse-backend/issues/1299)
- Related: [#1301 — Program Catalog and Filtering](https://github.com/Gen-x-academy/chainVerse-backend/issues/1301)
- Related: [#1304 — Discovery Abuse and Scraping Controls](https://github.com/Gen-x-academy/chainVerse-backend/issues/1304)
