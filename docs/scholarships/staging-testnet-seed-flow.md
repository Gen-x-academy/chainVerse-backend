# Scholarship Staging & Testnet Seed Flow

## Summary
Design for provisioning realistic programs, applicants, reviewers,
wallets, milestones, and payments without real personal data.

## Design
- A `seed:scholarships` script generates synthetic identities (faker-based
  names/emails, testnet-only Stellar keypairs) — never real PII.
- Seeding is idempotent: re-running clears only records tagged
  `seedBatchId` from a prior run, not unrelated staging data.
- The script validates the seeded data flows through the full
  application -> review -> award -> payout path against testnet before
  exiting successfully.
- A `--reset` flag reverses a specific seed batch by its `seedBatchId`.

## Follow-up
Implement `scripts/seed-scholarships.ts` using the existing testnet
Stellar adapter and the domain's public service methods.
