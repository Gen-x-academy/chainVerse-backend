import { Schema } from 'mongoose';
import {
  applyAuditImmutability,
  assertInsertOnly,
  AuditLogImmutableError,
  AuditLogSchema,
  FORBIDDEN_AUDIT_OPERATIONS,
  rejectMutation,
} from './audit-log.schema';

/** Names of the operations a schema has registered `pre` middleware for. */
function registeredPreHooks(schema: Schema): string[] {
  const hooks = (
    schema as unknown as { s: { hooks: { _pres: Map<string, unknown[]> } } }
  ).s.hooks;
  return Array.from(hooks._pres.keys());
}

describe('AuditLog schema immutability', () => {
  describe('guards', () => {
    it.each([...FORBIDDEN_AUDIT_OPERATIONS])(
      'rejectMutation refuses %s and names it in the message',
      (operation) => {
        expect(() => rejectMutation(operation)).toThrow(AuditLogImmutableError);
        expect(() => rejectMutation(operation)).toThrow(operation);
      },
    );

    it('allows inserting a brand new entry', () => {
      expect(() => assertInsertOnly({ isNew: true })).not.toThrow();
    });

    it('refuses re-saving an already persisted entry', () => {
      expect(() => assertInsertOnly({ isNew: false })).toThrow(
        AuditLogImmutableError,
      );
      expect(() => assertInsertOnly({ isNew: false })).toThrow(
        'update of existing entry',
      );
    });
  });

  describe('registration', () => {
    it('registers a pre hook for every forbidden operation', () => {
      const registered = registeredPreHooks(AuditLogSchema);

      for (const operation of FORBIDDEN_AUDIT_OPERATIONS) {
        expect(registered).toContain(operation);
      }
    });

    it('registers hooks for save and bulkWrite', () => {
      const registered = registeredPreHooks(AuditLogSchema);

      expect(registered).toContain('save');
      expect(registered).toContain('bulkWrite');
    });

    it('can be applied to any schema, not just the built-in one', () => {
      const schema = new Schema({ value: String });
      applyAuditImmutability(schema);

      expect(registeredPreHooks(schema)).toContain('deleteMany');
    });

    it('actually throws when the registered updateOne hook runs', () => {
      const schema = new Schema({ value: String });
      applyAuditImmutability(schema);

      const hooks = (
        schema as unknown as {
          s: { hooks: { _pres: Map<string, Array<{ fn: () => void }>> } };
        }
      ).s.hooks;
      const [hook] = hooks._pres.get('updateOne')!;

      expect(() => hook.fn.call({})).toThrow(AuditLogImmutableError);
    });
  });

  describe('storage shape', () => {
    it('stores timestamps under recordedAt and never updates them', () => {
      expect(AuditLogSchema.get('timestamps')).toEqual({
        createdAt: 'recordedAt',
        updatedAt: false,
      });
    });

    it('writes to a dedicated collection with no version key', () => {
      expect(AuditLogSchema.get('collection')).toBe('audit_logs');
      expect(AuditLogSchema.get('versionKey')).toBe(false);
    });

    it('indexes the fields audit reviews actually query', () => {
      const indexed = AuditLogSchema.indexes().map(([fields]) =>
        Object.keys(fields).join(','),
      );

      expect(indexed).toContain('actor.id,timestamp');
      expect(indexed).toContain('target.type,target.id,timestamp');
    });
  });
});
