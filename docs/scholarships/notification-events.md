# Scholarship Notification Events

## Summary
Design for emitting consistent events for deadlines, requests, decisions,
acceptance, milestones, and payments.

## Design
- One `ScholarshipNotificationEvent` shape: `{eventId, type, subjectId,
  occurredAt, minimalPayload}` — `minimalPayload` carries only what a
  notification channel needs to render, not the full domain record.
- Events are idempotent: the same `eventId` re-delivered to the
  notification pipeline is deduplicated before rendering/sending.
- Stable references (`applicationId`, `awardId`) are always included so
  a notification can deep-link back to the right resource.

## Follow-up
Implement `ScholarshipNotificationEvent` and emit it from the existing
outbox relay (see #1201) for each listed trigger.
