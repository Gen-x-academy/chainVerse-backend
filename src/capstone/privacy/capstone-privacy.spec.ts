import { applyFieldPrivacy, buildDataExport, eraseUserData, hasConsent, recordConsent } from './capstone-privacy';

describe('capstone privacy', () => {
  it('uses the latest consent entry', () => {
    let ledger = recordConsent([], 'u1', 'research', true);
    ledger = recordConsent(ledger, 'u1', 'research', false);
    expect(ledger).toHaveLength(2);
    expect(hasConsent(ledger, 'u1', 'research')).toBe(false);
  });

  it('hides private fields from the public', () => {
    const view = applyFieldPrivacy({ title: 'a', notes: 'b' }, { title: 'public' }, 'public');
    expect(view).toEqual({ title: 'a' });
  });

  it('exports only own records', () => {
    const out = buildDataExport('u1', [{ ownerId: 'u1' }, { ownerId: 'u2' }]);
    expect(out.records).toHaveLength(1);
  });

  it('erases personal fields', () => {
    const out = eraseUserData({ id: '1', email: 'x@y.z' }, ['email']);
    expect(out).not.toHaveProperty('email');
    expect(out.erased).toBe(true);
  });
});
