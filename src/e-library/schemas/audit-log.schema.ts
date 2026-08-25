import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<ELibraryAuditLog>;

export enum AuditAction {
  BOOK_CREATE = 'book_create',
  BOOK_UPDATE = 'book_update',
  BOOK_DELETE = 'book_delete',
  BOOK_COPY_ADD = 'book_copy_add',
  BOOK_COPY_UPDATE = 'book_copy_update',
  LOAN_CHECKOUT = 'loan_checkout',
  LOAN_RETURN = 'loan_return',
  LOAN_RENEW = 'loan_renew',
  HOLD_CREATE = 'hold_create',
  HOLD_CANCEL = 'hold_cancel',
  HOLD_FULFILL = 'hold_fulfill',
  POLICY_UPDATE = 'policy_update',
  CHARGE_CREATE = 'charge_create',
  PAYMENT_RECORD = 'payment_record',
  WAIVER_APPROVE = 'waiver_approve',
  WAIVER_REJECT = 'waiver_reject',
  DIGITAL_TAKEDOWN = 'digital_takedown',
  PATRON_NOTE_CREATE = 'patron_note_create',
  PATRON_NOTE_READ = 'patron_note_read',
  CONTENT_REPORT_ASSIGN = 'content_report_assign',
  CONTENT_REPORT_RESOLVE = 'content_report_resolve',
  REVIEW_REMOVE = 'review_remove',
}

@Schema({ _id: false })
class BeforeAfterState {
  @Prop({ type: Object, default: {} })
  value: Record<string, unknown>;
}

@Schema({ timestamps: false, collection: 'elibrary_audit_logs' })
export class ELibraryAuditLog {
  @Prop({ required: true, index: true })
  actorId: string;

  @Prop({ required: true, type: String, enum: AuditAction })
  action: AuditAction;

  @Prop({ required: true })
  targetType: string;

  @Prop({ required: true, index: true })
  targetId: string;

  @Prop({ type: String, default: null })
  requestId: string | null;

  @Prop({ type: String, default: null })
  reason: string | null;

  @Prop({ type: Object, default: {} })
  beforeState: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  afterState: Record<string, unknown>;

  @Prop({ required: true, default: Date.now })
  timestamp: Date;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;
}

export const ELibraryAuditLogSchema =
  SchemaFactory.createForClass(ELibraryAuditLog);

ELibraryAuditLogSchema.index({ actorId: 1, timestamp: -1 });
ELibraryAuditLogSchema.index({ targetType: 1, targetId: 1, timestamp: -1 });
ELibraryAuditLogSchema.index({ action: 1, timestamp: -1 });

// Immutable: block any update/delete operations
const IMMUTABLE_MSG =
  'Audit logs are append-only and cannot be modified or deleted';
ELibraryAuditLogSchema.pre('updateOne', function () {
  throw new Error(IMMUTABLE_MSG);
});
ELibraryAuditLogSchema.pre('updateMany', function () {
  throw new Error(IMMUTABLE_MSG);
});
ELibraryAuditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error(IMMUTABLE_MSG);
});
ELibraryAuditLogSchema.pre('deleteOne', function () {
  throw new Error(IMMUTABLE_MSG);
});
ELibraryAuditLogSchema.pre('deleteMany', function () {
  throw new Error(IMMUTABLE_MSG);
});
ELibraryAuditLogSchema.pre('findOneAndDelete', function () {
  throw new Error(IMMUTABLE_MSG);
});
