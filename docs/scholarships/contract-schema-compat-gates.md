# Scholarship Contract & Schema Compatibility Gates

## Summary
CI design to prevent incompatible API, event, database, and on-chain ABI
changes from merging unnoticed.

## Design
- CI generates the current OpenAPI/event-schema/ABI artifacts on every PR
  and diffs them against the `main`-branch versions.
- A breaking change (removed field, changed type, removed event) fails the
  check unless the PR includes a version bump and a migration note.
- The check identifies known consumers (from a small `consumers.json`
  registry) so reviewers see who is affected, not just what changed.
- Non-breaking additive changes (new optional field, new event type) pass
  automatically.

## Follow-up
Add a `scholarship-contract-check` CI job comparing generated artifacts
against `main` using the existing CI workflow conventions.
