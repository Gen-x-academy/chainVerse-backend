# Mentorship Rematch Workflow (MENTOR-042)

## Purpose

Handles incompatibility or availability changes through an explicit workflow:
request, review, closure plan, successor proposal and closure. A private reason
is scoped to the requester and coordinators; the counterpart sees only a
reason category and the shared, non-blaming continuity notes. Open financial or
safety cases block unsafe closure and successor proposals.

Cross-repository work item: `MENTOR-042` (backend rematch workflow; paired with
client work that renders the request form, private reason input and successor
proposal).

## Dependencies

- `JwtAuthGuard` (`src/common/guards/jwt-auth.guard.ts`) and `access-token`.
- `MongooseModule` models `RematchRequest` and `RematchEvent`.
- `MetricsModule` + shared `MentorshipTelemetry` for guarded counters.
- Stable error codes reused: `MENTOR_ACCESS_DENIED`, `RES_NOT_FOUND`,
  `BIZ_INVALID_STATE_TRANSITION`, `BIZ_MENTORSHIP_BLOCKED`,
  `BIZ_MENTORSHIP_LIFECYCLE_CONFLICT`, `VAL_INVALID_INPUT`.

## State machine

```
requested -> reviewed -> closure_planned -> proposed -> closed
    |            |              |              |
    +------------+--------------+--------------+---> cancelled
```

Transitions are table-driven (`REMATCH_TRANSITIONS`). Terminal states (`closed`,
`cancelled`) have no outgoing transitions.

## Privacy boundary

- `privateReason` is a private free-text field. The `get` projection omits it
  entirely for the counterpart and any non-party; coordinators and the
  requester may read it.
- Transition event `note` free text is likewise stripped from history reads by
  the counterpart.
- `continuityNotes` and the successor proposal are deliberately shared and
  written in non-blaming terms.
- Metrics return only aggregate counts and average days to closure — no
  per-person scores, identifiers or free text. This avoids blame scoring.

## Safety and immutability

- Blocker references point to financial/safety cases by opaque id. If any is
  `open`, `proposeSuccessor` and `close` are denied with a stable code; cases
  must be resolved upstream first.
- A partial unique index allows only one open request per (mentorship,
  requester); closed/cancelled requests remain as history and are never
  overwritten.
- Each state change appends a `RematchEvent` and is guarded by a conditional
  `findOneAndUpdate` on the current state and version so retries cannot
  duplicate effects.
- Prior records remain intact: there are no update/delete endpoints for
  historical requests or events.
- Telemetry counters are emitted on requests, transitions, blockages, denials
  and replays; every emission is guarded.

## Endpoints

All routes are under `mentorship/rematch` and require a bearer token.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/` | Request a rematch |
| GET | `/metrics` | Aggregate non-blaming metrics |
| GET | `/:id` | Get a request (private reason scoped) |
| GET | `/:id/history` | Append-only transition history (notes scoped) |
| POST | `/:id/review` | Coordinator review |
| POST | `/:id/closure-plan` | Record continuity notes |
| POST | `/:id/successor` | Propose a successor (blocker-checked) |
| POST | `/:id/close` | Close the rematch (blocker-checked) |
| POST | `/:id/cancel` | Cancel an open request |

## Rollout and rollback

- Rollout: additive module registered in `src/app.module.ts`. Ensure the
  partial unique index on open requests is built before enabling the request
  endpoint so duplicate races cannot create two open requests.
- Rollback: unregister `RematchModule`. Do not drop the request or event
  collections — they are the audit trail of the rematch decision and are
  referenced by support and finance.
- In production, blocker references should be populated from live finance and
  safety systems at request time; the stored snapshot is what the service
  enforces. No other module is edited or migrated.
