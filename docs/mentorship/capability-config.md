# Mentorship capability configuration

Environment-driven flags and limits for mentorship (**MENTOR-002**). Validation
and defaults live in `src/common/config/env.validation.ts`, so the app **refuses
to start** on an invalid value. Code: `src/mentorship-config/`.

| Variable | Default | Range / format |
|---|---|---|
| `MENTORSHIP_ENABLED` | `false` | boolean — master switch |
| `MENTORSHIP_PAYMENTS_ENABLED` | `false` | boolean — ignored unless the master switch is on |
| `MENTORSHIP_MAX_ACTIVE_MENTEES_PER_MENTOR` | `10` | 1–100 |
| `MENTORSHIP_MAX_ACTIVE_ENGAGEMENTS_PER_MENTEE` | `3` | 1–20 |
| `MENTORSHIP_SUPPORTED_CURRENCIES` | `USDC,XLM` | comma-separated upper-case asset codes (2–12 chars) |
| `MENTORSHIP_SESSION_MIN_MINUTES` | `15` | 5–240 |
| `MENTORSHIP_SESSION_MAX_MINUTES` | `120` | ≥ min, ≤ 480 |
| `MENTORSHIP_FREE_CANCELLATION_HOURS` | `24` | 0–168 |
| `MENTORSHIP_EVIDENCE_MAX_FILES` | `5` | 1–20 |
| `MENTORSHIP_EVIDENCE_MAX_MB` | `10` | 1–50 |
| `MENTORSHIP_EVIDENCE_RETENTION_DAYS` | `365` | 30–3650 |

## Observability

`GET /mentorship/config` (authenticated) returns the effective configuration.
It reads only the whitelisted `MENTORSHIP_*` keys and holds no secrets.

## Using it from other modules

Import `MentorshipConfigModule` and inject `MentorshipConfigService`
(`get()` / `isEnabled()`).

## Rollout and gaps

- Safe by default: nothing is enabled until `MENTORSHIP_ENABLED=true`.
- Additive: new optional variables, no migration.
- Environment-aware flags are per deployment (set per environment); runtime
  toggling without a restart is not provided.
- No mentorship feature consumes these values on `main` yet; they are the
  contract that later MENTOR-xxx work reads.
- Unit specs cover default, override and invalid values; no integration test
  boots the full app.
