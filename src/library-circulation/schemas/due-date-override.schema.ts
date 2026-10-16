import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type DueDateOverrideDocument = HydratedDocument<DueDateOverride>;

export enum DueDateOverrideStatus {
  /** Applied immediately — within normal staff authority. */
  APPLIED = 'applied',
  /** Exceeds staff authority (limit or hold conflict) — awaiting admin approval. */
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * An audited manual correction/extension of a loan's due date. Loan history
 * is never edited in place — every override is its own record, and the
 * loan's dueAt is only updated once the override takes effect (APPLIED or
 * APPROVED).
 */
@Schema({ timestamps: true })
export class DueDateOverride {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Loan', required: true, index: true })
  loanId: string;

  @Prop({ required: true })
  previousDueAt: Date;

  @Prop({ required: true })
  newDueAt: Date;

  @Prop({ required: true, trim: true })
  reason: string;

  @Prop({ required: true })
  requestedByStaffId: string;

  @Prop({ enum: DueDateOverrideStatus, required: true, index: true })
  status: DueDateOverrideStatus;

  /** True when the extension exceeds MAX_STAFF_OVERRIDE_EXTENSION_DAYS. */
  @Prop({ default: false })
  exceedsStaffLimit: boolean;

  /** True when another patron holds an active hold on the same item. */
  @Prop({ default: false })
  hasHoldConflict: boolean;

  @Prop({ type: String, default: null })
  resolvedByStaffId?: string | null;

  @Prop({ type: String, default: null })
  approvalNote?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const DueDateOverrideSchema = SchemaFactory.createForClass(DueDateOverride);
