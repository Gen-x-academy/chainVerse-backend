/**
 * Chart of accounts for a scholarship program ledger.
 *
 *   treasury           asset      funds held in the program's on-chain treasury account
 *   program_fund       equity     unencumbered funds available for new reservations
 *   reserved           liability  funds earmarked for scholarships not yet awarded
 *   awards_payable     liability  awarded amounts owed to recipients but not yet paid
 *
 * Paid-out totals are derived from `disbursement` entries rather than kept in
 * a separate expense account. Debit-normal accounts (treasury) increase with debits;
 * credit-normal accounts increase with credits. Every entry must have
 * sum(debits) == sum(credits).
 */
export const LEDGER_ACCOUNTS = [
  'treasury',
  'program_fund',
  'reserved',
  'awards_payable',
] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

export const DEBIT_NORMAL_ACCOUNTS: ReadonlySet<LedgerAccount> = new Set([
  'treasury',
]);

export const LEDGER_ENTRY_TYPES = [
  'funding',
  'reservation',
  'reservation_release',
  'award',
  'award_cancellation',
  'disbursement',
  'refund',
  'recovery',
  'adjustment',
  'reversal',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/** Types a client may post directly (reversals go through their own endpoint). */
export const POSTABLE_ENTRY_TYPES = LEDGER_ENTRY_TYPES.filter(
  (t): t is Exclude<LedgerEntryType, 'reversal'> => t !== 'reversal',
);

/**
 * Standard postings. `adjustment` has no template: the caller supplies
 * explicit balanced lines and a reason.
 */
export const ENTRY_TEMPLATES: Record<
  Exclude<LedgerEntryType, 'adjustment' | 'reversal'>,
  { debit: LedgerAccount; credit: LedgerAccount; description: string }
> = {
  funding: {
    debit: 'treasury',
    credit: 'program_fund',
    description: 'Sponsor funding received into treasury',
  },
  reservation: {
    debit: 'program_fund',
    credit: 'reserved',
    description: 'Funds reserved for scholarship awards',
  },
  reservation_release: {
    debit: 'reserved',
    credit: 'program_fund',
    description: 'Unused reservation released back to the fund',
  },
  award: {
    debit: 'reserved',
    credit: 'awards_payable',
    description: 'Scholarship awarded; amount payable to recipient',
  },
  award_cancellation: {
    debit: 'awards_payable',
    credit: 'reserved',
    description: 'Unpaid award cancelled; amount returned to reserve',
  },
  disbursement: {
    debit: 'awards_payable',
    credit: 'treasury',
    description: 'Award installment paid to recipient on-chain',
  },
  refund: {
    debit: 'program_fund',
    credit: 'treasury',
    description: 'Unused funds refunded to sponsor',
  },
  recovery: {
    debit: 'treasury',
    credit: 'program_fund',
    description: 'Previously disbursed funds recovered from recipient',
  },
};

/**
 * Entry types that create new obligations and therefore must pass the
 * solvency / reconciliation gate before posting.
 */
export const OBLIGATION_ENTRY_TYPES: ReadonlySet<LedgerEntryType> = new Set([
  'reservation',
  'award',
]);
