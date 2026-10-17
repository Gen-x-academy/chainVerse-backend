# Issue #1304 — Add Discovery Abuse and Scraping Controls (MENTOR-029)

## Context

ChainVerse provides 1-on-1 mentorship with smart-contract-backed payments. This document covers the backend implementation of shared work item **MENTOR-029** in the Discovery track.

**Audit baseline**
- Repository: `Gen-x-academy/chainVerse-backend`
- Audited branch: `main`
- Audited commit: `c268376358e465bb4676455485797a26cdd964e2`
- Audit date: 2026-10-16

> This spec must be revalidated against the latest `main` before implementation begins.

---

## Goal

Protect the mentorship directory and profile surfaces (catalog, recommendations, profiles) from abusive access patterns — including rate-based scraping, sequential enumeration, and unauthorized data extraction — while keeping the experience fluid for legitimate users.

---

## Functional Scope

| Control | Notes |
|---|---|
| Rate limiting | Per-identity and per-IP limits on discovery endpoints |
| Enumeration resistance | Sequential ID traversal must not leak whether a resource exists |
| Caching policy | Correct cache headers prevent stale data and reduce origin load |
| Bot signals | Suspicious request patterns are detected and flagged |
| Safe public-field projections | Only approved fields are returned; no private data can be inferred |
| Observability | Security events are logged and metered for monitoring and alerting |

---

## Affected Surfaces

| Surface | Endpoint Pattern | Risk |
|---|---|---|
| Program catalog | `GET /mentorship/programs` | Bulk scraping of all programs and seat data |
| Program detail | `GET /mentorship/programs/:programId` | Enumeration of program IDs |
| Mentor directory | `GET /mentors` | Bulk scraping of mentor profiles |
| Mentor profile | `GET /mentors/:mentorId` | Enumeration of mentor IDs; private field extraction |
| Recommendations | `GET /mentees/me/recommendations` | Probing recommendation logic; indirect data extraction |

---

## Domain Model

### `AbuseEvent`

Structured log record for security-relevant access events. Used for alerting and audit, not for blocking decisions (blocking uses in-memory / Redis rate limit state).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `eventType` | enum | See event types below |
| `actorId` | UUID \| null | Authenticated user ID; null for unauthenticated |
| `actorIp` | string | Hashed or masked IP (see privacy section) |
| `endpoint` | string | Normalized path (no IDs, e.g., `/mentors/:id`) |
| `requestId` | string | Correlation ID from the request |
| `metadata` | jsonb | Additional context (e.g., window count, flag reason) |
| `occurredAt` | timestamptz | |

**Event types:**
- `rate_limit_triggered` — request blocked by rate limiter
- `enumeration_probe` — sequential or pattern-matched ID access detected
- `bot_signal_detected` — request matched a bot heuristic
- `projection_violation` — client attempted to access a restricted field (if applicable)

---

## Rate Limiting

### Strategy

Rate limiting is enforced at two layers:

1. **Per-identity (authenticated):** Limits applied to `userId` from the JWT.
2. **Per-IP (unauthenticated / fallback):** Limits applied to the originating IP address.

IP addresses must be normalized and hashed before storage to comply with privacy requirements.

### Limits (configurable via environment variables)

| Endpoint group | Window | Authenticated limit | Unauthenticated limit |
|---|---|---|---|
| Program catalog (`GET /mentorship/programs`) | 1 minute | 60 requests | 20 requests |
| Program detail (`GET /mentorship/programs/:id`) | 1 minute | 120 requests | 30 requests |
| Mentor directory (`GET /mentors`) | 1 minute | 60 requests | 20 requests |
| Mentor profile (`GET /mentors/:id`) | 1 minute | 120 requests | 30 requests |
| Recommendations (`GET /mentees/me/recommendations`) | 1 minute | 30 requests | N/A (auth required) |

All limits must be configurable without redeployment.

### Response on Limit Exceeded

```
HTTP 429 Too Many Requests
Retry-After: <seconds>
X-RateLimit-Limit: <limit>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <unix timestamp>
```

Rate limit responses must not reveal the specific limit tier applied (authenticated vs. IP) to avoid fingerprinting.

---

## Enumeration Resistance

Sequential traversal of resource IDs (e.g., incrementing UUIDs, probing `/mentors/00000001` through `/mentors/00000099`) must not allow an attacker to infer the existence or non-existence of a resource.

### Implementation Requirements

1. **Consistent 404 response time:** Requests for non-existent resources must return `404` in approximately the same time as requests for existing resources — no timing oracle.
2. **No existence oracle on unauthorized access:** A `403 Forbidden` for an existing private resource and a `404 Not Found` for a non-existent resource must be indistinguishable to an unauthenticated caller. Return `404` in both cases for unauthenticated requests.
3. **Opaque IDs:** All public IDs must be UUIDs (v4 random), never sequential integers or predictable tokens.
4. **Probe detection:** If a single actor accesses more than a configurable number of distinct resource IDs within a time window, log an `enumeration_probe` event and apply a stricter rate limit tier.

---

## Caching Policy

| Surface | Cache-Control | Notes |
|---|---|---|
| Program catalog | `public, max-age=60, stale-while-revalidate=120` | Shared catalog; short TTL for seat freshness |
| Program detail | `public, max-age=60, stale-while-revalidate=300` | |
| Mentor directory | `public, max-age=300, stale-while-revalidate=600` | Profiles change less frequently |
| Mentor profile | `public, max-age=300, stale-while-revalidate=600` | |
| Recommendations | `private, no-store` | Personal data; must not be cached by intermediaries |
| Rate-limited responses | `no-store` | Never cache 429 responses |

`ETag` and `Last-Modified` headers should be set for catalog and profile endpoints to support conditional requests.

---

## Bot Detection

Bot signals are heuristic and must not block legitimate users on their own. They are used to escalate rate limit tiers or log events for review.

### Signals to Detect

| Signal | Heuristic |
|---|---|
| Missing `User-Agent` | Request has no User-Agent header |
| Non-browser User-Agent | Known crawler / scraper agent strings |
| Headless browser markers | Presence of headless browser detection headers |
| Abnormal request cadence | Requests arrive at a perfectly regular interval (< 100ms jitter) |
| Sequential ID access | Monotonically increasing or pattern-matched resource IDs in a session |
| High distinct-resource rate | More than N distinct resource IDs accessed per minute |

When two or more signals are present simultaneously, log a `bot_signal_detected` event and apply the unauthenticated rate limit tier regardless of authentication status.

---

## Safe Public-Field Projections

Each discovery endpoint must return only an explicitly approved field list. No endpoint must ever return:

- Internal database IDs beyond the public-facing UUID
- Private mentor contact details (email, phone, social handles beyond public profiles)
- Enrollment counts that could identify individual mentees
- Billing or payment information
- Internal status flags or audit fields

### Approved Public Fields — Mentor Profile

| Field | Included |
|---|---|
| `mentorId` | ✅ |
| `displayName` | ✅ |
| `expertise` | ✅ (normalized tags only) |
| `languages` | ✅ |
| `deliveryModes` | ✅ |
| `availability` (weekly slots + timezone) | ✅ |
| `trustSignals` (verified, reviewCount, averageRating) | ✅ |
| `email` | ❌ |
| `phone` | ❌ |
| `internalNotes` | ❌ |
| `enrollmentHistory` | ❌ |

All field projections must be enforced in a serializer or DTO layer — **not** via ad-hoc field exclusion in controller logic.

---

## Authorization Policy

- Discovery endpoints are accessible to authenticated users only; unauthenticated requests receive `401`.
- Rate limits apply to all callers regardless of authentication status.
- Bot signal escalation applies to all callers.
- Enumeration probes are logged for all callers; accounts with repeat probe events may be flagged for manual review.
- No rate limit bypass is permitted for any role, including admin, unless explicitly documented.

---

## Persistence Notes

- Rate limit counters are stored in Redis (or the project's existing cache layer) with TTL matching the rate limit window.
- `AbuseEvent` rows are written asynchronously (fire-and-forget) to avoid adding latency to the hot path.
- IP addresses stored in `AbuseEvent` must be hashed (e.g., SHA-256 + per-deployment salt) or masked (last octet zeroed for IPv4) before persistence.

---

## Background / Async Behavior

| Trigger | Action |
|---|---|
| `rate_limit_triggered` event | Log to `AbuseEvent`; emit metric counter |
| `enumeration_probe` event | Log to `AbuseEvent`; emit metric counter; optionally alert on threshold |
| `bot_signal_detected` event | Log to `AbuseEvent`; escalate rate limit tier for session |
| Scheduled job (daily) | Aggregate abuse event counts by actor; flag accounts exceeding thresholds for review |

---

## Acceptance Criteria

- [ ] Normal browsing (authenticated users within limits) is unaffected by rate limiting.
- [ ] Requests exceeding rate limits receive `429` with a `Retry-After` header.
- [ ] Sequential ID enumeration is detected and logged; probe events appear in `AbuseEvent`.
- [ ] Non-existent and unauthorized resources are indistinguishable to unauthenticated callers (both return `404`).
- [ ] All discovery endpoints return only approved public fields; private fields cannot be extracted.
- [ ] Correct `Cache-Control` headers are set on all affected endpoints.
- [ ] Recommendations endpoint returns `private, no-store` cache headers.
- [ ] Bot signal detection logs `bot_signal_detected` events when two or more signals are present.
- [ ] All rate limits are configurable via environment variables without redeployment.
- [ ] IP addresses are hashed or masked before storage in `AbuseEvent`.
- [ ] OpenAPI documentation is updated for affected endpoints (rate limit headers, 429 responses).
- [ ] Unit and integration tests cover: success within limits, limit exceeded (429), enumeration probe detection, bot signal detection, field projection enforcement, caching headers, authorization denial, idempotency, and failure paths.
- [ ] Retries do not duplicate effects.
- [ ] Errors are stable, typed, and actionable.
- [ ] Security events (`AbuseEvent`) are observable via metrics and logs.

---

## Privacy Boundaries

| Data | Treatment |
|---|---|
| IP addresses | Hashed or masked before storage; raw IP never persisted |
| Actor identity in abuse logs | `actorId` (UUID) only; no PII |
| Rate limit counters in Redis | Keyed by hashed IP or user ID; no PII in key |
| Enumeration probe patterns | Logged as counts and endpoint patterns; no individual resource IDs stored |

---

## Rollout Considerations

- Rate limiting and caching headers can be deployed independently of other MENTOR-029 controls.
- Enumeration resistance changes (consistent 404 timing) require careful testing to avoid introducing new timing oracles.
- Bot detection starts in **log-only** mode; escalation to active blocking is a separate, reviewed rollout step.
- `AbuseEvent` table is new — no migration conflicts expected.
- Redis rate limit keys use a configurable prefix to support multi-tenant deployments.
- All limit thresholds must be reviewed and approved by the security team before production enablement.

---

## Dependencies

| Dependency | Notes |
|---|---|
| Redis / cache layer | Required for rate limit counter storage |
| Mentee auth / JWT | Caller identity for per-identity rate limiting |
| Program catalog / Issue #1301 | Primary surface protected by this issue |
| Mentor directory | Primary surface protected by this issue |
| MENTOR-028 / Issue #1302 | Recommendations surface protected by this issue |
| MENTOR-029 (other repos) | Corresponding frontend work in `chainVerse-frontend` (if any) |
| Security / audit logging infrastructure | `AbuseEvent` writes feed into existing audit log pipeline if available |

---

## References

- GitHub Issue: [#1304](https://github.com/Gen-x-academy/chainVerse-backend/issues/1304)
- Related: [#1301 — Program Catalog and Filtering](https://github.com/Gen-x-academy/chainVerse-backend/issues/1301)
- Related: [#1302 — Recommend Mentors with Explainable Matching](https://github.com/Gen-x-academy/chainVerse-backend/issues/1302)
- Related: [#1299 — Mentor Comparison Workflow](https://github.com/Gen-x-academy/chainVerse-backend/issues/1299)
