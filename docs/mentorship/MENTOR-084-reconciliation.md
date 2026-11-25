# MENTOR-084 — Mentorship financial ledger reconciliation

Module: `src/mentorship/reconciliation`. Endpoints under `/mentorship/reconciliation` (finance/admin roles only, deny-by-default).

- **Inputs**: internal entries (`intent`, `hold`, `release`, `refund`, `fee`) and external/on-chain transactions, joined on `externalRef`. Intents never need an external transaction.
- **Classification** (pure, deterministic, sorted by key): `matched`, `missing_external`, `missing_internal`, `amount_mismatch`, `currency_mismatch`, `duplicate_external`.
- **Idempotent, resumable runs**: unique `idempotencyKey`; mismatches are upserted on `(runId, key)`; the run `cursor` advances per persisted item, so a retry after a crash resumes and never double-counts. A completed run replays its summary.
- **Corrections**: propose (note ≥ 10 chars), then sign-off or reject by a *different* finance user (403 `CORRECTION_NEEDS_SECOND_SIGNER`). Reconciliation never mutates ledger balances itself; signed-off corrections are the audit trail for a separate posting.
- **Telemetry**: `mentorship_reconciliation_run_total`, `mentorship_reconciliation_correction_total{outcome}`, `mentorship_reconciliation_denied_total{reason}`.
