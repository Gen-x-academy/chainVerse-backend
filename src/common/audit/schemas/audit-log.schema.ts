import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { AuditOutcome } from '../audit-action.enum';

export type AuditLogDocument = HydratedDocument<AuditLog>;

export class AuditActorSnapshot {
  id: string;
  email: string | null;
  role: string | null;
  ip: string | null;
  userAgent: string | null;
}

export class AuditTargetSnapshot {
  type: string;
  id: string | null;
}

/**
 * Append-only record of a privileged mutation.
 *
 * Immutability is enforced at three layers:
 *  1. `applyAuditImmutability` rejects every update/delete query on the model.
 *  2. A `pre('save')` hook rejects saving an already-persisted document.
 *  3. `integrityHash` is an HMAC over the entry, so out-of-band tampering
 *     (e.g. direct `mongosh` writes) is detectable via `AuditService.verify`.
 */
@Schema({
  collection: 'audit_logs',
  versionKey: false,
  timestamps: { createdAt: 'recordedAt', updatedAt: false },
})
export class AuditLog {
  /** Value from {@link AuditAction}. */
  @Prop({ required: true, index: true })
  action: string;

  /** Who performed the action. */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  actor: AuditActorSnapshot;

  /** What the action was performed on. */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  target: AuditTargetSnapshot;

  /** Correlation ID from `X-Request-Id`, set by RequestIdMiddleware. */
  @Prop({ required: true, index: true })
  requestId: string;

  /** When the action happened (distinct from `recordedAt`, when it was stored). */
  @Prop({ type: Date, required: true, default: () => new Date(), index: true })
  timestamp: Date;

  @Prop({
    required: true,
    enum: Object.values(AuditOutcome),
    default: AuditOutcome.SUCCESS,
  })
  outcome: string;

  /** Redacted state before the mutation; `null` for creations. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  before: Record<string, unknown> | null;

  /** Redacted state after the mutation; `null` for deletions. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  after: Record<string, unknown> | null;

  /** Operator-supplied justification, where the endpoint collects one. */
  @Prop({ type: String, default: null })
  reason: string | null;

  /** HMAC-SHA256 over the canonical entry payload. */
  @Prop({ required: true })
  integrityHash: string;

  readonly recordedAt?: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

/** Query methods that would mutate or remove existing audit entries. */
export const FORBIDDEN_AUDIT_OPERATIONS = [
  'updateOne',
  'updateMany',
  'replaceOne',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'findOneAndRemove',
  'deleteOne',
  'deleteMany',
  'remove',
] as const;

export class AuditLogImmutableError extends Error {
  constructor(operation: string) {
    super(
      `Audit log entries are append-only; "${operation}" is not permitted on audit_logs`,
    );
    this.name = 'AuditLogImmutableError';
  }
}

/** Always throws — the body of every forbidden-operation hook. */
export function rejectMutation(operation: string): never {
  throw new AuditLogImmutableError(operation);
}

/**
 * Guard for `pre('save')`: creating an entry is fine, re-saving a persisted one
 * is not.
 */
export function assertInsertOnly(document: { isNew: boolean }): void {
  if (!document.isNew) {
    throw new AuditLogImmutableError('save (update of existing entry)');
  }
}

/**
 * Installs the append-only guards. Exported separately so the behaviour can be
 * unit-tested against a bare schema without a live connection.
 */
export function applyAuditImmutability(schema: MongooseSchema): void {
  for (const operation of FORBIDDEN_AUDIT_OPERATIONS) {
    schema.pre(operation as 'updateOne', function () {
      rejectMutation(operation);
    });
  }

  schema.pre('save', function (this: { isNew: boolean }) {
    assertInsertOnly(this);
  });

  // Bulk paths bypass the query middleware above, so block them too.
  schema.pre('bulkWrite', function () {
    rejectMutation('bulkWrite');
  });
}

applyAuditImmutability(AuditLogSchema);

// Common review queries: "what did this actor do", "what happened to this target".
AuditLogSchema.index({ 'actor.id': 1, timestamp: -1 });
AuditLogSchema.index({ 'target.type': 1, 'target.id': 1, timestamp: -1 });
