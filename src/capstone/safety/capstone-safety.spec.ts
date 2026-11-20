import { isBlocked, isEvidenceExpired, selectProtectiveMeasure, transitionDispute } from './capstone-safety';

describe('capstone safety', () => {
  it('selects measures by severity', () => {
    expect(selectProtectiveMeasure(1)).toBe('warn');
    expect(() => selectProtectiveMeasure(5)).toThrow('CAPSTONE_SEVERITY_INVALID');
  });

  it('enforces dispute flow', () => {
    expect(transitionDispute('open', 'mediation')).toBe('mediation');
    expect(() => transitionDispute('resolved', 'open')).toThrow('CAPSTONE_DISPUTE_TRANSITION_INVALID');
  });

  it('blocks in both directions', () => {
    expect(isBlocked([['a', 'b']], 'b', 'a')).toBe(true);
    expect(isBlocked([['a', 'b']], 'a', 'c')).toBe(false);
  });

  it('expires evidence after retention', () => {
    const now = new Date('2027-12-01T00:00:00Z');
    expect(isEvidenceExpired('report', new Date('2026-01-01T00:00:00Z'), now)).toBe(true);
    expect(isEvidenceExpired('dispute', new Date('2026-01-01T00:00:00Z'), now)).toBe(false);
  });
});
