# Issue #1297 — Move Rust Files Out of `src/mini`

## Summary

`src/mini` contains Soroban smart contract files written in Rust. These files do not belong in the NestJS TypeScript backend. Smart contracts are maintained in the separate `chainVerse-onchain` repository.

## Affected Files

| File | Description |
|------|-------------|
| `src/mini/lib.rs` | Crate root; re-exports all types from `types.rs` and gates `test_contract` behind `#[cfg(test)]` |
| `src/mini/types.rs` | Shared Soroban `#[contracttype]` enums and structs (subscriptions, attendance, tiers, metadata) |
| `src/mini/test_contract.rs` | Contract-level test module |

### What the code contains

`types.rs` defines the following Soroban contract types used across ManageHub smart contracts:

- **Metadata** — `MetadataValue`, `TokenMetadata`, `MetadataUpdate`, with `validate_metadata` / `validate_attribute` helpers
- **Subscriptions** — `SubscriptionPlan`, `SubscriptionTier`, `TierLevel`, `TierFeature`, `TierPromotion`, `TierChangeRequest`, `TierChangeType`, `TierChangeStatus`
- **Attendance** — `AttendanceAction`, `AttendanceFrequency`, `UserAttendanceStats`, `PeakHourData`, `DayPattern`, `DateRange`, `TimePeriod`
- **Users** — `UserRole`, `MembershipStatus`

## Problem

Rust / Soroban source files inside a NestJS backend repository cause several issues:

- Build tooling (tsc, ESLint, Jest) ignores `.rs` files but their presence creates confusion about what the repository owns.
- `cargo` / Soroban build tooling is not configured here; the files cannot be compiled or tested from this repo.
- Ownership is ambiguous — contract changes made here will not be reflected in the deployed on-chain artifacts maintained in `chainVerse-onchain`.

## Required Actions

1. **Verify** whether `lib.rs`, `types.rs`, and `test_contract.rs` already exist in `chainVerse-onchain`. The canonical location is the `chainVerse-onchain` repository under an appropriate crate (e.g., `contracts/manage-hub/src/`).
2. **If missing from `chainVerse-onchain`**: open a PR on that repository adding the files before removing them here, to avoid losing the code.
3. **Remove** `src/mini/` from this repository once the code is confirmed safe in `chainVerse-onchain`.
4. Open a PR on `chainVerse-backend` that deletes the folder. The PR should contain **only** this change.

## Acceptance Criteria

- No `.rs` files remain anywhere under `src/` in this repository.
- The contract types are accessible in `chainVerse-onchain`.

## Dependencies

- `chainVerse-onchain` repository — must be checked before deletion.

## Estimated Effort

2–4 hours.

## References

- GitHub Issue: [#1297](https://github.com/Gen-x-academy/chainVerse-backend/issues/1297)
