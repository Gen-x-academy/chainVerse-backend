import {
  operationMatchesAsset,
  PayoutAsset,
} from '../stellar/scholarship-stellar.gateway';

type TxRecord = {
  hash: string;
  successful: boolean;
  source_account: string;
  memo_type: string;
  memo?: string;
  ledger_attr: number;
  paging_token?: string;
  created_at?: string;
};

type OpRecord = Record<string, unknown> & { id: string; type: string };

export interface ExpectedPayout {
  sourceAccount: string;
  destination: string;
  amount: string;
  asset: PayoutAsset;
  /** Base64 hash memo written at submission. */
  memo: string;
}

export type EvidenceResult =
  | { ok: true; operation: OpRecord }
  | { ok: false; reason: string };

/**
 * Checks that a successful on-chain transaction is exactly the payout we
 * built: same signer, same memo, and a single payment moving the expected
 * amount of the expected asset to the expected destination. Anything else is
 * treated as a mismatch and never finalizes the payment.
 */
export function verifyPayoutEvidence(
  tx: TxRecord,
  ops: OpRecord[],
  expected: ExpectedPayout,
): EvidenceResult {
  if (!tx.successful)
    return { ok: false, reason: 'transaction not successful' };
  if (tx.source_account !== expected.sourceAccount) {
    return { ok: false, reason: 'unexpected source account' };
  }
  if (tx.memo_type !== 'hash' || tx.memo !== expected.memo) {
    return { ok: false, reason: 'memo does not match payment attempt' };
  }

  const payments = ops.filter((op) => op.type === 'payment');
  if (payments.length !== 1 || ops.length !== 1) {
    return { ok: false, reason: 'expected exactly one payment operation' };
  }

  const op = payments[0];
  const from = (op['from'] as string | undefined) ?? tx.source_account;
  if (
    from !== expected.sourceAccount ||
    op['to'] !== expected.destination ||
    op['amount'] !== expected.amount ||
    !operationMatchesAsset(op, expected.asset)
  ) {
    return { ok: false, reason: 'payment operation does not match' };
  }
  return { ok: true, operation: op };
}

export interface ExpectedReversal {
  /** Address the payout went to — the funds must leave it. */
  recipientAddress: string;
  /** Treasury that paid; a return payment must go back here. */
  treasuryAddress: string;
  amount: string;
  asset: PayoutAsset;
}

/**
 * Finds the operation that undoes a payout: either an issuer clawback from the
 * recipient, or a return payment from the recipient to the treasury, for the
 * full amount in the same asset.
 */
export function findReversalOperation(
  ops: OpRecord[],
  expected: ExpectedReversal,
): OpRecord | null {
  return (
    ops.find((op) => {
      if (op['amount'] !== expected.amount) return false;
      if (!operationMatchesAsset(op, expected.asset)) return false;
      if (op.type === 'clawback') {
        return op['from'] === expected.recipientAddress;
      }
      if (op.type === 'payment') {
        return (
          op['from'] === expected.recipientAddress &&
          op['to'] === expected.treasuryAddress
        );
      }
      return false;
    }) ?? null
  );
}

/** Ledgers closed on top of (and including) the one that holds the tx. */
export function confirmationsFor(includedLedger: number, tip: number): number {
  return Math.max(0, tip - includedLedger + 1);
}
