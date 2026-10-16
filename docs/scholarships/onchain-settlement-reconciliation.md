# On-Chain Settlement Reconciliation

## Summary
Design for reconciling backend award/payment intents with authoritative
Soroban/Stellar transactions and events.

## Design
- A payment intent is only "final" once a matching on-chain transaction
  hash is observed and confirmed at the configured ledger-depth; explicit
  states: `pending`, `submitted`, `confirmed`, `mismatched`.
- Reprocessing a reconciliation pass is idempotent: it only transitions
  intents forward and never re-submits a transaction with an existing hash.
- A mismatch (on-chain amount/destination differs from the intent) creates
  an operator alert and pauses the intent rather than auto-correcting it.
- Frontend/API status reads the reconciled state, not the pre-confirmation
  intent state, once reconciliation has run.

## Follow-up
Implement `SettlementReconciliationJob` against the existing `src/stellar`
adapter and the award/payment collections.
