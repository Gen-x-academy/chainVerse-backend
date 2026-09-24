export enum LedgerEntryType {
  OVERDUE_FINE = 'overdue_fine',
  LOST_ITEM_FEE = 'lost_item_fee',
  REPLACEMENT_COST_FEE = 'replacement_cost_fee',
  DAMAGE_FEE = 'damage_fee',
  PAYMENT = 'payment',
  WAIVER = 'waiver',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
  /** Compensating entry that reverses the REPLACEMENT_COST_FEE on late return. */
  REPLACEMENT_COST_REVERSAL = 'replacement_cost_reversal',
}

// Entry types that increase what a patron owes.
export const CHARGE_ENTRY_TYPES: LedgerEntryType[] = [
  LedgerEntryType.OVERDUE_FINE,
  LedgerEntryType.LOST_ITEM_FEE,
  LedgerEntryType.REPLACEMENT_COST_FEE,
  LedgerEntryType.DAMAGE_FEE,
];

// Entry types that are always compensating records referencing a prior charge.
export const COMPENSATING_ENTRY_TYPES: LedgerEntryType[] = [
  LedgerEntryType.WAIVER,
  LedgerEntryType.REFUND,
  LedgerEntryType.REPLACEMENT_COST_REVERSAL,
];
