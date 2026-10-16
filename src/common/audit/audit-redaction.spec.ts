import {
  isSensitiveKey,
  maskEmail,
  redactMetadata,
  snapshot,
  REDACTED,
} from './audit-redaction';

describe('audit redaction', () => {
  describe('isSensitiveKey', () => {
    it.each([
      'password',
      'Password',
      'newPassword',
      'refreshToken',
      'API_KEY',
      'api-key',
      'authorization',
      'card_number',
      'ssn',
      'mnemonic',
    ])('flags %s as sensitive', (key) => {
      expect(isSensitiveKey(key)).toBe(true);
    });

    it.each(['status', 'title', 'decision', 'organizationId', 'role'])(
      'leaves %s alone',
      (key) => {
        expect(isSensitiveKey(key)).toBe(false);
      },
    );
  });

  describe('maskEmail', () => {
    it('keeps the domain and first character only', () => {
      expect(maskEmail('ada@example.com')).toBe('a**@example.com');
    });

    it('leaves non-addresses untouched', () => {
      expect(maskEmail('not-an-email')).toBe('not-an-email');
    });
  });

  describe('redactMetadata', () => {
    it('replaces sensitive values but keeps the key present', () => {
      const result = redactMetadata({
        email: 'admin@chainverse.io',
        password: 'hunter2',
        refreshToken: 'eyJhbGciOi...',
        status: 'approved',
      }) as Record<string, unknown>;

      expect(result.password).toBe(REDACTED);
      expect(result.refreshToken).toBe(REDACTED);
      expect(result.status).toBe('approved');
      expect(result.email).toBe('a****@chainverse.io');
    });

    it('redacts nested sensitive values', () => {
      const result = redactMetadata({
        actor: { id: 'u1', credentials: { secret: 'abc' } },
      }) as Record<string, any>;

      expect(result.actor.id).toBe('u1');
      expect(result.actor.credentials).toBe(REDACTED);
    });

    it('truncates oversized strings', () => {
      const result = redactMetadata(
        { note: 'a'.repeat(1000) },
        { maxStringLength: 10 },
      ) as Record<string, string>;

      expect(result.note.startsWith('aaaaaaaaaa')).toBe(true);
      expect(result.note).toContain('truncated');
      expect(result.note.length).toBeLessThan(1000);
    });

    it('caps array length and reports how many were dropped', () => {
      const result = redactMetadata([1, 2, 3, 4, 5], {
        maxArrayLength: 2,
      }) as unknown[];

      expect(result).toEqual([1, 2, '[+3 more]']);
    });

    it('collapses branches deeper than maxDepth', () => {
      const deep = { a: { b: { c: { d: 'too far' } } } };
      const result = redactMetadata(deep, { maxDepth: 2 }) as Record<
        string,
        any
      >;

      expect(result.a.b).toBe('[depth-limit]');
    });

    it('breaks cycles instead of overflowing the stack', () => {
      const cyclic: Record<string, unknown> = { name: 'root' };
      cyclic.self = cyclic;

      const result = redactMetadata(cyclic) as Record<string, unknown>;

      expect(result.name).toBe('root');
      expect(result.self).toBe('[circular]');
    });

    it('serialises dates and buffers to storable primitives', () => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      const result = redactMetadata({
        at: date,
        blob: Buffer.from('abc'),
      }) as Record<string, unknown>;

      expect(result.at).toBe('2026-01-01T00:00:00.000Z');
      expect(result.blob).toBe('[buffer:3]');
    });

    it('maps null and undefined to null', () => {
      expect(redactMetadata(null)).toBeNull();
      expect(redactMetadata(undefined)).toBeNull();
    });
  });

  describe('snapshot', () => {
    it('keeps only the requested fields and redacts them', () => {
      const result = snapshot(
        { status: 'pending', password: 'x', title: 'Course', extra: 'drop me' },
        ['status', 'title', 'password'],
      );

      expect(result).toEqual({
        status: 'pending',
        title: 'Course',
        password: REDACTED,
      });
    });

    it('unwraps mongoose documents via toObject', () => {
      const doc = {
        toObject: () => ({ status: 'approved', title: 'Course' }),
      };

      expect(snapshot(doc as never, ['status'])).toEqual({
        status: 'approved',
      });
    });

    it('returns null for a missing source', () => {
      expect(snapshot(null, ['status'])).toBeNull();
    });
  });
});
