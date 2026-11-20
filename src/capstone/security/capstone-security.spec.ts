import { randomBytes } from 'crypto';
import { ABUSE_CASES, assertSameTenant, buildAuditEntry, decryptField, encryptField } from './capstone-security';

describe('capstone security', () => {
  it('encrypts and decrypts with a versioned key', () => {
    const key = randomBytes(32);
    const payload = encryptField('secret', key, 2);
    expect(payload.startsWith('2:')).toBe(true);
    expect(decryptField(payload, { 2: key })).toBe('secret');
  });

  it('rejects unknown key versions', () => {
    const payload = encryptField('secret', randomBytes(32), 1);
    expect(() => decryptField(payload, {})).toThrow('CAPSTONE_KEY_VERSION_UNKNOWN');
  });

  it('strips sensitive fields from audit entries', () => {
    const entry = buildAuditEntry('u1', 'update', 'p1', { privateNotes: 'x', title: 'y' });
    expect(entry.details).toEqual({ title: 'y' });
  });

  it('lists abuse cases', () => {
    expect(ABUSE_CASES.length).toBeGreaterThan(0);
  });

  it('enforces tenant boundaries', () => {
    expect(() => assertSameTenant('t1', 't1')).not.toThrow();
    expect(() => assertSameTenant('t1', 't2')).toThrow('CAPSTONE_TENANT_FORBIDDEN');
  });
});
