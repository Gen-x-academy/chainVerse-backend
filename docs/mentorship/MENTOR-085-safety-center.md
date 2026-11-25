# MENTOR-085 — Mentorship safety center

Module: `src/mentorship/safety-center`. Endpoints under `/mentorship/safety`.

- **Conduct and emergency guidance**: `GET /guidance` serves versioned conduct rules and emergency steps (with a clear "not an emergency service" disclaimer).
- **Privacy choices and trusted contacts**: `GET|PUT /settings`. Own settings only (keyed by the authenticated user, never by a path id). Up to 5 trusted contacts.
- **Reporting and blocking**: `POST /reports` is idempotent per `(reporter, idempotencyKey)`. `?alsoBlock=true` also creates a block via `MentorshipBlockingService`. Self-reports are rejected.
- **Case status**: reporters see `status` and `resolutionSummary` only. Internal notes and the assignee never leave staff endpoints. Reading someone else's report returns the same 404 as a missing one.
- **Staff**: `GET /cases`, `PATCH /cases/:id` need `admin`, `moderator` or `safety`. Transitions: open → under_review | dismissed, under_review → resolved | dismissed. Terminal states are final.
- **Telemetry** (low-cardinality): `mentorship_safety_report_total{category}`, `mentorship_safety_case_total{status}`, `mentorship_safety_settings_updated_total`, `mentorship_safety_denied_total{reason}`.
- **Cross-repo notes**: the frontend should render guidance from this endpoint rather than hard-coding copy, show only the reporter view, and send a fresh `idempotencyKey` per report form.
