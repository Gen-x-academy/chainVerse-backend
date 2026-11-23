# Mentorship matching feedback loop

Work item **MENTOR-043** — *Add matching feedback loop* (#1328). The
cross-repository counterpart work (web/mobile feedback prompts and the
reporting dashboard) consumes the endpoints below; no frontend or contract
changes are made here.

## Purpose

Collect optional, private feedback on recommendation relevance, declined
proposals and match quality so future matching can be improved transparently.
Consent and retention are explicit on every submission, free text is protected,
and aggregate reporting excludes identifying details. Feedback is write-once and
has no code path that can modify an agreement, proposal or term version.

## Module and dependencies

- Code: `src/mentorship/feedback/` (registered in `src/app.module.ts`).
- `MongooseModule` — collection `mentorship_feedback`.
- `MetricsModule` — domain counters via `MentorshipTelemetry`.
- `JwtAuthGuard` — supplies the submitting actor's `sub` and `role`.
- No dependency on the agreements or matching-proposal modules: feedback is
  stored in its own collection and is strictly read-only for reporting.

## Data model

Each row stores actor/subject references, `kind`, `subjectType`, a 1–5 `rating`,
optional free text (plus its SHA-256 hash for integrity checks),
`consentGiven: true`, an explicit `retentionPolicy`, a server-derived
`retentionExpiresAt` and an idempotency hash. There is no update or delete
endpoint; expiry is enforced on reads.

Available retention policies: `anonymized_90d` and `anonymized_365d`. The API
computes the deadline from the policy so clients cannot extend retention.

## Privacy boundary

| Data | Author | Admin (with reason) | Moderator / other participants |
|------|--------|---------------------|--------------------------------|
| Feedback receipt (kind, rating, policy, timestamps) | Yes | Yes | No (list is own-only) |
| Subject id | Detail only | Detail only | No |
| Free text | Detail, before expiry | Detail with reason, before expiry | No |
| Aggregated ratings (cohort ≥ 5) | No | No | Coordinators only |

Aggregation runs a `$project` that drops `actorId`, `subjectId`, `freeText`,
`freeTextHash` and `idempotencyKeyHash`, then groups by kind and rating. Kinds
with fewer than five responses are omitted entirely to prevent re-identification.

## Endpoints

All routes require `Authorization: Bearer <token>` and are served under the
global `/api/v1` prefix.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/mentorship/feedback` | Submit feedback (requires `consentGiven: true` and a retention policy) |
| GET | `/mentorship/feedback/mine` | List the caller's receipts (no free text) |
| GET | `/mentorship/feedback/aggregate?kind=&from=&to=` | Anonymized rating metrics (coordinators only) |
| GET | `/mentorship/feedback/:id?reason=` | Detail; free text only for the author or a reason-supplying admin |

## Idempotency, errors and telemetry

`(actorId, idempotencyKeyHash)` is unique. Repeating a submission with the same
key returns the original receipt without creating a second row.

Stable codes: `FEEDBACK_CONSENT_REQUIRED`, `FEEDBACK_RETENTION_INVALID`,
`FEEDBACK_NOT_FOUND`, `FEEDBACK_SUBMIT_DENIED`,
`FEEDBACK_AGGREGATE_DENIED`, `FEEDBACK_FREE_TEXT_DENIED`.
Authorization denials use `MENTOR_ACCESS_DENIED`.

Counters: `mentorship_feedback_events_total{event,outcome}` and
`mentorship_feedback_denied_total{reason}`. No user ids, subject ids or free
text are used as label values.

## Rollout and rollback

1. Deploy and pre-create the unique `(actorId, idempotencyKeyHash)` index when
   `autoIndex` is off.
2. Enable feedback prompts in the client only after consent copy is approved;
   the API refuses submissions that lack explicit consent.
3. Monitor `retention_expired` and `free_text_released` counters; unexpected
   admin detail reads should be investigated via the audit logs.
4. Rollback: remove `MatchingFeedbackModule` from `AppModule`. The collection
   is self-contained and no other module reads or writes it; no data migration
   is required.
