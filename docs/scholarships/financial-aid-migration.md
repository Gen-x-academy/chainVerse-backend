# Financial-Aid to Scholarship Migration

## Summary
Design for mapping eligible legacy financial-aid applications into the
scholarship domain without losing history.

## Design
- Migration runs as a resumable batch job keyed by legacy record ID, with
  a checkpoint table so a restart continues rather than reprocessing.
- `--dry-run` mode reports the mapping outcome (mapped / skipped /
  unmapped-with-reason) without writing any scholarship records.
- Re-running the migration for an already-migrated record is a no-op
  (idempotent), matched by a stored `legacyRecordId` reference.
- Legacy identifiers and original timestamps are preserved on the new
  scholarship record for audit continuity.

## Follow-up
Implement `FinancialAidMigrationJob` under `src/scholarships` with the
checkpoint table and the dry-run report format.
