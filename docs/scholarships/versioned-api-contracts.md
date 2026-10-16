# Versioned Scholarship API Contracts

## Summary
Design for providing stable schemas for programs, applications, reviews,
awards, milestones, payments, errors, and pagination.

## Design
- OpenAPI schemas for the eight resource types above are generated from
  the DTOs already used by the controllers, not maintained by hand.
- CI diffs generated schemas against the last published version (same
  mechanism as #1213); a breaking change requires a new API version path
  segment (`/v2/...`).
- Example fixtures in the schema docs are executed against the real
  handlers in CI so examples can't silently go stale.
- Pagination and error envelope shapes are shared across all eight
  resources rather than each defining its own.

## Follow-up
Wire OpenAPI generation for the scholarships module into the existing
contract-compatibility CI job from #1213.
