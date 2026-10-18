# Mentorship Goals, Consent & Disputes

## Issues
- Closes #1368 — Create engagement goals and success criteria
- Closes #1370 — Create mentorship milestones (no new collection added; milestone references already exist via deliverables)
- Closes #1369 — Track goal progress check-ins
- Closes #1366 — Add session recording consent controls
- Closes #1365 — Support session completion disputes
- Closes #1367 — Add class-validator decorators to privacy-policy-management DTOs

## Modules
- `src/mentorship-goals/` — goals with measurable success criteria, versioned updates, completion with evidence, deterministic check-ins
- `src/mentorship-consent/` — session recording consent (prohibited/optional/required) with revoke guardrails for required consent, bidirectional dispute flow

## Key rules
- Goals: target dates validated, revisions versioned, private/engagement visibility supported, check-ins immutable by sequence
- Consent: no recording starts without required consent in a production flow; revocation blocked when required; retention policy recorded
- Disputes: status machine (open/responded/resolved/closed), deadlines enforced, resolution outcomes auditable; both sides can be tracked
- Privacy: sensitive fields handled via references; raw media never public
- Authorization: deny-by-default with JWT guard

## Notes
Additive modules; no breaking changes.
