# Transactional Scholarship Domain Events

## Summary
Design for publishing durable, outbox-backed events for cross-module
workflows and external consumers.

## Design
- An `outbox_events` collection written in the **same transaction** as the
  domain mutation (program/application/review/award/milestone change).
- A background relay polls `outbox_events` and publishes to the existing
  event bus, marking rows `published_at` on success.
- Each event carries `eventId`, `schemaVersion`, `correlationId`, and
  `occurredAt`, so consumers can deduplicate by `eventId`.
- Publish failures retry with backoff; the relay never publishes the same
  row twice on success (checked via `published_at IS NULL`).

## Follow-up
Implement `OutboxEvent` schema and `OutboxRelayService`, wiring it into
the existing scholarships services' write paths.
