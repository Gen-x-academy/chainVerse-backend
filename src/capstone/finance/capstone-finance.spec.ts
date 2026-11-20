import { LedgerEntry, confirmEscrow, reconcileLedger, releaseMilestone, validateExpenseClaim } from './capstone-finance';

describe('capstone finance', () => {
  const funded: LedgerEntry[] = [{ id: 'd1', type: 'deposit', amount: 100 }];

  it('confirms escrow funding', () => {
    expect(confirmEscrow(funded, 100)).toBe(true);
    expect(confirmEscrow(funded, 200)).toBe(false);
  });

  it('releases milestones once and within balance', () => {
    const after = releaseMilestone(funded, 'm1', 40);
    expect(() => releaseMilestone(after, 'm1', 10)).toThrow('CAPSTONE_MILESTONE_ALREADY_RELEASED');
    expect(() => releaseMilestone(after, 'm2', 100)).toThrow('CAPSTONE_INSUFFICIENT_ESCROW');
  });

  it('requires receipts on expense claims', () => {
    expect(() => validateExpenseClaim({ amount: 10, category: 'travel' })).toThrow('CAPSTONE_EXPENSE_RECEIPT_REQUIRED');
  });

  it('reconciles the ledger', () => {
    expect(reconcileLedger(funded, 100).matched).toBe(true);
    expect(reconcileLedger(funded, 90).difference).toBe(-10);
  });
});
