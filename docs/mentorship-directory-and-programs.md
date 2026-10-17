# Mentorship programs and discovery

This document records the backend scope for MENTOR-022, MENTOR-023, and MENTOR-024.

## Dependencies

The feature uses MongoDB/Mongoose, the existing JWT guard, the mentor profile publication workflow, and the existing availability history. OpenAPI is generated from the Nest controllers. Request metrics remain covered by the global metrics interceptor.

## Privacy boundary

Directory and detail responses query only published profiles with public visibility and explicitly project public profile fields. Draft content, private visibility, owner identifiers, availability notes, participants, decisions, payments, and private evidence are not copied into program clones or returned by discovery endpoints.

## Program lifecycle

Active programs may be archived by their owner and then remain read-only. Cloning copies configuration only, creates a draft, and records the source program identifier. Archive and clone operations are authenticated and ownership-scoped; callers cannot address another mentor's records.

## Rollout

Apply the `mentorship_programs` collection indexes before enabling the program UI. Roll out directory reads first, then expose create/archive/clone actions to the mentor dashboard. Monitor request latency, empty-result rate, authorization failures, and archive/clone failures through the existing request telemetry.

## Cross-repository work

The corresponding MENTOR-022, MENTOR-023, and MENTOR-024 client and contract work must consume the generated OpenAPI document and keep application submission flows aligned with the `applicationPath` returned by mentor detail.
