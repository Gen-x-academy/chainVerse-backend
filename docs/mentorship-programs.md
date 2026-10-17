# Mentorship programs: cohorts, eligibility, and waitlists

This document covers the backend delivery for MENTOR-017, MENTOR-018, and MENTOR-019.

## Dependencies and API surface

The feature uses MongoDB through the existing Mongoose integration, the existing global JWT guard, the existing idempotency module, and Nest's scheduler and event emitter. New authenticated endpoints are exposed under `/mentorship`:

- `POST /programs/:programId/cohorts` creates a cohort with enrollment dates, capacity, coordinators, calendar, and settings.
- `POST /cohorts/:cohortId/enrollment` confirms a participant atomically when a seat is available or places them on the ordered waitlist.
- `POST /cohorts/:cohortId/close` closes enrollment.
- `POST /cohorts/:cohortId/coordinators` records a coordinator transfer in the cohort audit collection.
- `GET /cohorts/:cohortId/report` returns a coordinator-only cohort-filtered report.
- `POST /cohort-offers/:offerId/confirm` confirms a non-expired promotion offer.
- `POST /programs/:programId/eligibility/versions` publishes a versioned rule set.
- `POST /programs/:programId/eligibility/evaluate` returns only explainable decisions and missing fields.

All write endpoints require `X-Idempotency-Key`. Replays with the same authenticated actor, route, and payload return the cached response; reuse with another payload is rejected.

## Authorization and privacy

The global JWT guard protects every route. Cohort administration is deny-by-default: only the cohort creator or a listed coordinator can close, transfer, or view a cohort report. Participants may enroll themselves; enrolling another person requires coordinator authorization. Offer confirmation is restricted to the offered participant.

Eligibility evaluation allowlists role, organization membership, course progress, skills, and prerequisites. Age and geography are excluded unless the caller explicitly provides the corresponding consent flags. Unknown and sensitive attributes are never echoed in the result. Missing attributes produce actionable explanations instead of an inferred decision.

## Capacity and background behavior

Seat allocation uses a MongoDB conditional increment (`confirmedCount < capacity`) so concurrent requests cannot oversubscribe confirmed capacity. Full cohorts create one ordered waitlist entry per participant. The scheduler expires reserved offers and promotes the earliest waiting participant with a 48-hour offer. Enrollment, offer, and transfer events are emitted for operational notifications and audit consumers.

## Rollout and operations

The feature can be rolled out behind the existing mentorship configuration flags. Start with a disabled cohort-creation client, enable one program, and monitor `mentorship.cohort.enrolled`, `mentorship.cohort.offer.created`, and `mentorship.cohort.offer.confirmed` events together with API error-code rates. The existing webhook security module is registered at application level so future webhook handlers can apply `WebhookSignatureGuard`; invalid-signature coverage remains in the security unit suite.

The corresponding frontend and contract work should use the same program and cohort identifiers. Client teams should treat the eligibility `version`, `missing`, and `decisions` fields as stable contract data and should not attempt to reconstruct private attributes from them.
