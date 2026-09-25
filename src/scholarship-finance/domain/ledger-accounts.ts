/**
 * Chart of accounts for the scholarship finance ledger. Balances are kept
 * per (organizationId, account, assetKey) and in "normal side" terms, so a
 * positive balance is always the healthy direction. Every account is
 * guarded to never go negative — that is how solvency is enforced.
 */
export type NormalSide = 'debit' | 'credit';

export const LedgerAccounts = {
  /** Assets physically held for the tenant (wallet / bank). Debit-normal. */
  CUSTODY: 'asset:custody',
  /** Platform fee revenue, kept apart from sponsor funds. Credit-normal. */
  PLATFORM_FEE_REVENUE: 'revenue:platform_fee',
  /** Network / rail fees owed to third parties. Credit-normal. */
  NETWORK_FEE_PAYABLE: 'liability:network_fee_payable',
  /** Approved refunds awaiting payout. Credit-normal. */
  REFUND_PAYABLE: 'liability:refund_payable',
  /** Amounts recipients owe under open recovery claims. Debit-normal. */
  RECOVERY_RECEIVABLE: 'asset:recovery_receivable',
  /** Offsets the receivable until cash is collected (memo). Credit-normal. */
  RECOVERY_CONTRA: 'contra:recovery_pending',
} as const;

const POOL_ACCOUNT = 'liability:fund:pool';
const PROGRAM_PREFIX = 'liability:fund:program:';

/** Sponsor-funded liability for a program, or the unrestricted pool when programId is null. */
export function fundAccount(programId: string | null | undefined): string {
  return programId ? `${PROGRAM_PREFIX}${programId}` : POOL_ACCOUNT;
}

export function isFundAccount(account: string): boolean {
  return account === POOL_ACCOUNT || account.startsWith(PROGRAM_PREFIX);
}

export function normalSide(account: string): NormalSide {
  return account.startsWith('asset:') ? 'debit' : 'credit';
}

export interface AssetRef {
  code: string;
  /** Stellar issuer account, or null for the native asset / fiat. */
  issuer: string | null;
}

export function assetKey(asset: AssetRef): string {
  return `${asset.code.toUpperCase()}:${asset.issuer ?? 'native'}`;
}
