# Scheduled Deadline & Action Reminders

## Summary
Design for configurable reminders for incomplete applications, reviews,
acceptance, evidence, and payout setup.

## Design
- Reminder jobs are scheduled per-record with a timezone-aware trigger
  time computed from the record's deadline minus a configured offset.
- A `reminders_sent` set (keyed by `{recordId, reminderType}`) prevents
  duplicate sends if the scheduler runs the check more than once.
- A reminder is cancelled automatically once its target action completes
  (e.g. application submitted) via the existing domain event stream.
- Reminders respect a per-user quiet-hours window where the channel
  supports deferral (e.g. push), skipping only the delivery time, not the
  reminder itself.

## Follow-up
Implement `ScholarshipReminderScheduler` using the existing job-queue
infrastructure already used elsewhere in the backend.
