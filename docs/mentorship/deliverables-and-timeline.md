# Mentorship Deliverables & Progress Timeline

Backend for shared work items **MENTOR-073**, **MENTOR-074** and **MENTOR-075**.

## Modules

- `src/mentorship-deliverables/` — versioned deliverable submissions (MENTOR-073) and
  reviewer decisions (MENTOR-074).
- `src/mentorship-timeline/` — ordered, permission-filtered progress timeline (MENTOR-075).

## API

| Method | Route | Purpose |
| ------ | ----- | ------- |
| POST | `/mentorship/deliverables` | Submit a versioned deliverable (file/link/commit/text reference) |
| GET | `/mentorship/deliverables/milestone/:milestoneId` | List milestone deliverables visible to the caller |
| GET | `/mentorship/deliverables/:id` | Fetch one (submitter, reviewer or decider only) |
| POST | `/mentorship/deliverables/:id/reviews` | Accept, request changes, or reject the current version |
| GET | `/mentorship/deliverables/:id/access` | Resolve private reference inside its access window |
| POST | `/mentorship/timeline/events` | Append a goal/session/milestone/deliverable/decision/agreement event |
| GET | `/mentorship/timeline/engagements/:engagementId` | Cursor-paginated timeline (`before`, `limit`) |
| GET | `/mentorship/timeline/events/:id` | Authorized detail view for one entry |

## Key rules

- **Immutability** — each submission is a new `version` row; existing versions are never mutated.
- **Type/size policy** — per-kind byte/character limits enforced at submission; only references are stored, never raw media.
- **Private content** — expiring access window; references are never public.
- **Late policy** — `late` is computed against the milestone due date supplied at submission.
- **Review eligibility** — only the current version can be reviewed; only reviewers explicitly listed at submission may decide; the submitter can never review their own work; decisions are idempotent per (deliverable, reviewer, decision).
- **Single side effect** — acceptance dispatches its downstream action once, guarded by `acceptanceDispatched`.
- **Timeline ordering** — per-engagement monotonic `sequence` gives a stable total order; descending-cursor pagination never gaps when events are appended mid-walk.
- **Privacy boundary** — private timeline entries are omitted entirely for users outside the audience (never redacted); each entry links to an authorized detail view.
- **Authorization** — deny-by-default: every route requires a JWT, and services re-check party/reviewer membership.

## Dependencies, rollout, cross-repo work

- Depends on: MongoDB (Mongoose), global `ValidationPipe`, `JwtAuthGuard`, `ParseObjectIdPipe`.
- No migrations required; new collections are created on first write.
- Rollout is additive — no existing routes or schemas change. Safe to deploy behind the existing auth stack.
- Telemetry/audit: events are append-only; wire `MentorshipAuditService` when the shared audit log (MENTOR-111) lands.
- Corresponding frontend/contract work for MENTOR-073/074/075 lives in the other ChainVerse repositories.
