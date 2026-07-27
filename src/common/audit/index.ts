export { AuditAction, AuditOutcome } from './audit-action.enum';
export {
  AuditActor,
  resolveAuditContext,
  systemAuditContext,
} from './audit-context';
export type { AuditContext } from './audit-context';
export { AuditModule } from './audit.module';
export { AuditService, canonicalize } from './audit.service';
export type { AuditEntryInput } from './audit.service';
export {
  isSensitiveKey,
  maskEmail,
  redactMetadata,
  snapshot,
  REDACTED,
  SENSITIVE_KEY_PATTERNS,
} from './audit-redaction';
export {
  AuditLog,
  AuditLogSchema,
  AuditLogImmutableError,
  applyAuditImmutability,
  assertInsertOnly,
  rejectMutation,
  FORBIDDEN_AUDIT_OPERATIONS,
} from './schemas/audit-log.schema';
export type { AuditLogDocument } from './schemas/audit-log.schema';
