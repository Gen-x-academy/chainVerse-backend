# Signed Sponsor Webhooks

## Summary
Design for delivering selected program and award events to approved
sponsor endpoints.

## Design
- Payloads are signed with HMAC-SHA256 using a per-sponsor secret; the
  signature and a Unix timestamp go in `X-Scholarship-Signature` /
  `X-Scholarship-Timestamp` headers.
- Receivers reject requests older than 5 minutes to resist replay.
- Delivery attempts (status, response code, latency) are recorded in a
  `webhook_deliveries` collection, retried with exponential backoff up to
  a max attempt count, then marked `failed`.
- Sponsors can rotate their signing secret; both old and new secrets are
  accepted for a grace window to avoid delivery gaps mid-rotation.

## Follow-up
Implement `SponsorWebhookService.deliver(event, sponsor)` and the
delivery-history read endpoint for sponsors.
