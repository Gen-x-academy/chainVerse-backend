# Project Objectives and Success Criteria (CAPSTONE-057)

Prioritized, measurable project objectives with owners, baselines, targets, dates, visibility, charter
linkage and success criteria. Additive, in-memory and tenant-keyed (same model as
`project-milestones`); no migration. Routes live under `/api/v1/objectives/tenants/{tenantId}`.
This is separate from the minimal check-in objectives in `project-planning`, which are untouched.

## API

| Method | Route | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/projects` | admin, moderator (create); project owner/planner (replace) | Register a project membership stub |
| POST | `/projects/{projectId}/objectives` | project owner/planner, admin, moderator | Create a draft objective with criteria |
| GET | `/projects/{projectId}/objectives` | any authenticated user (visibility applies) | List visible objectives, highest priority first |
| GET | `/objectives/{id}` | any authenticated user (visibility applies) | Get one objective |
| PATCH | `/objectives/{id}` | project owner/planner, admin, moderator | Replace a draft definition (needs `expectedVersion`) |
| POST | `/objectives/{id}/transitions` | project owner/planner, admin, moderator | Change status (needs `expectedVersion`) |
| POST | `/objectives/{id}/progress` | objective owner, project owner/planner, admin, moderator | Record the current metric value |
| GET | `/audit` | admin, moderator | Audit metadata |

Every mutation requires an `idempotencyKey` (`^[A-Za-z0-9._-]{8,128}$`). Swagger documents DTOs and
error responses at `/api/docs`.

## Model and rules

- **Measurable:** `unit`, `direction` (`increase`/`decrease`), `baseline`, `target`. The target must
  move away from the baseline in the stated direction (`VAL_OBJECTIVE_TARGET_INVALID`).
  `startDate` must precede `targetDate` (`VAL_OBJECTIVE_DATES_INVALID`).
- **Owner:** must be a member of the project (`BIZ_OBJECTIVE_OWNER_NOT_MEMBER`).
- **Priority:** `critical`, `high`, `medium`, `low`. Lists are ordered by priority, then creation time.
- **Success criteria:** up to 10 per objective: `label`, `threshold`, `required` (default true).
  Thresholds must lie between baseline and target. A criterion is met when the current value reaches
  its threshold in the objective direction. Progress is `(current − baseline)/(target − baseline)`,
  clamped to 0–100%.
- **Charter linkage:** an opaque `charterReference`, required to activate
  (`BIZ_OBJECTIVE_CHARTER_REQUIRED`).
- **Lifecycle:** `draft → active | abandoned`, `active → achieved | abandoned`; `achieved` and
  `abandoned` are terminal. Anything else returns `BIZ_OBJECTIVE_INVALID_TRANSITION` with the allowed
  targets. Activation also needs at least one criterion (`BIZ_OBJECTIVE_CRITERIA_REQUIRED`).
  Achievement needs every required criterion met (`BIZ_OBJECTIVE_CRITERIA_UNMET`, with the unmet count).
- **Editing:** definitions change only in `draft` (`BIZ_OBJECTIVE_NOT_EDITABLE`); progress only in
  `active`.
- **Stale requests:** each change increments `version`. PATCH and transitions send `expectedVersion`;
  a mismatch returns `BIZ_OBJECTIVE_STALE_VERSION` (409) with `details.currentVersion`.

## Visibility

| Visibility | Who sees it |
| --- | --- |
| `private` | project owners/planners, the objective owner, platform admins |
| `team` | every project member, platform admins |
| `public` | every authenticated user in the tenant |

Project members and platform admins get the full detail. Non-members only ever see `public`
objectives, in a minimal view (title, priority, status, target date, progress; no owner, baseline,
target, current value, criteria or charter). Objectives a viewer cannot see return
`RES_OBJECTIVE_NOT_FOUND`, so their existence is not disclosed.

## Concurrency and idempotency

State-changing work is serialised per tenant, so version checks are atomic: of several concurrent
changes at the same version, exactly one wins and the rest get `BIZ_OBJECTIVE_STALE_VERSION`. Same key
and payload replays the stored response (so a retried transition succeeds instead of reporting a stale
version); the same key with a different payload returns `BIZ_IDEMPOTENCY_KEY_REUSED` (409).

## Privacy boundaries

- Audit entries are metadata only (actor, roles, action, resource id, outcome, hashes), including
  denied and failed attempts. Titles, criterion labels, values and charter references are never logged.
- Titles and criterion labels are shown to everyone who can see the objective, and to anyone in the
  tenant for `public` objectives, so keep them non-sensitive. Keep private proposal, research,
  identity, safety and financial content out of them.
- The JWT carries no tenant claim, so the path `tenantId` is the tenant boundary (repo-wide
  limitation, same as `project-milestones`).

## Dependencies

None at runtime. The `charterReference` is opaque; this module does not validate it against a charter
store. Project membership is held in this module's own stub, so projects must be registered here as
well as in other capstone modules.

## Rollout and rollback

Additive: the module is registered in `AppModule`. Register projects, then enable objective authoring
in the client behind a flag. Roll back by hiding the entry points; the module can stay deployed. Data
is in-memory, so a restart clears projects and objectives until a persistent repository replaces
`ProjectObjectivesRepository`.

## Cross-repository work

CAPSTONE-057 also has frontend (objective editor and success-criteria UI), contracts (objective and
criteria schema) and charter/planning counterparts in their repositories. Link them in the PR
description.
