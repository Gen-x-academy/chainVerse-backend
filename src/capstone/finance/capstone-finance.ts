export interface LedgerEntry {
  id: string;
  type: 'deposit' | 'release' | 'reimbursement';
  amount: number;
}

// CAPSTONE-085: escrow is confirmed once deposits cover the budget.
export function confirmEscrow(entries: LedgerEntry[], budget: number): boolean {
  const deposited = entries.filter((e) => e.type === 'deposit').reduce((s, e) => s + e.amount, 0);
  return deposited >= budget;
}

// CAPSTONE-086: release a milestone payment once, within the balance.
export function releaseMilestone(entries: LedgerEntry[], milestoneId: string, amount: number): LedgerEntry[] {
  if (entries.some((e) => e.id === milestoneId)) throw new Error('CAPSTONE_MILESTONE_ALREADY_RELEASED');
  if (amount > balance(entries)) throw new Error('CAPSTONE_INSUFFICIENT_ESCROW');
  return [...entries, { id: milestoneId, type: 'release', amount }];
}

// CAPSTONE-087: validate an expense reimbursement claim.
export function validateExpenseClaim(claim: { amount: number; receiptId?: string; category: string }): void {
  if (claim.amount <= 0) throw new Error('CAPSTONE_EXPENSE_AMOUNT_INVALID');
  if (!claim.receiptId) throw new Error('CAPSTONE_EXPENSE_RECEIPT_REQUIRED');
  if (!['travel', 'materials', 'software'].includes(claim.category)) throw new Error('CAPSTONE_EXPENSE_CATEGORY_INVALID');
}

// CAPSTONE-088: reconcile the ledger against an external statement.
export function balance(entries: LedgerEntry[]): number {
  return entries.reduce((s, e) => (e.type === 'deposit' ? s + e.amount : s - e.amount), 0);
}

export function reconcileLedger(entries: LedgerEntry[], statementBalance: number) {
  const ledgerBalance = balance(entries);
  return { ledgerBalance, statementBalance, difference: statementBalance - ledgerBalance, matched: ledgerBalance === statementBalance };
}
