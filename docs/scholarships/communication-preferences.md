# Per-Event Communication Preferences

## Summary
Design for letting users choose in-app, email, SMS, or push channels
per event type, while preserving mandatory operational notices.

## Design
- A `CommunicationPreference` document keyed by `{userId, eventType}` with
  an allowed-channel set; missing entries default to in-app + email.
- Preferences are scoped per event type, not global, so a user can mute
  "milestone reminders" while keeping "award decision" notices.
- A fixed `mandatory: true` flag on select event types (e.g. legal/security
  notices) bypasses preference filtering entirely.
- Preference changes take effect on the next event emitted, never
  retroactively resending already-delivered notifications.

## Follow-up
Implement the preference schema and a filtering step in the notification
dispatch pipeline before channel fan-out.
