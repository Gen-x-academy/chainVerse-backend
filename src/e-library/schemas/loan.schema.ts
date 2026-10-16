import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LoanDocument = HydratedDocument<Loan>;

export enum LoanStatus {
  ACTIVE = 'active',
  RETURNED = 'returned',
}

/** Condition of the specific copy a patron is holding for this loan. */
export enum CopyStatus {
  NORMAL = 'normal',
  DAMAGED = 'damaged',
  LOST = 'lost',
  FLAGGED = 'flagged',
}

export type RenewalMethod = 'manual' | 'auto';

@Schema({ _id: false })
export class RenewalHistoryEntry {
  @Prop({ required: true })
  previousDueDate: Date;

  @Prop({ required: true })
  newDueDate: Date;

  @Prop({ required: true, default: Date.now })
  renewedAt: Date;

  @Prop({ required: true })
  policyVersion: number;

  @Prop({ required: true, enum: ['manual', 'auto'] })
  method: RenewalMethod;
}

export const RenewalHistoryEntrySchema =
  SchemaFactory.createForClass(RenewalHistoryEntry);

@Schema({ timestamps: true, collection: 'library_loans' })
export class Loan {
  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Book', index: true })
  bookId: Types.ObjectId;

  @Prop({ required: true, index: true })
  workKey: string;

  @Prop({ required: true, default: Date.now })
  checkedOutAt: Date;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ required: true, default: 0, min: 0 })
  renewalCount: number;

  @Prop({ required: true, enum: LoanStatus, default: LoanStatus.ACTIVE })
  status: LoanStatus;

  @Prop({ required: true, enum: CopyStatus, default: CopyStatus.NORMAL })
  copyStatus: CopyStatus;

  @Prop({ required: true, default: false })
  autoRenewEnabled: boolean;

  @Prop({ type: [RenewalHistoryEntrySchema], default: [] })
  renewalHistory: RenewalHistoryEntry[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const LoanSchema = SchemaFactory.createForClass(Loan);
LoanSchema.index({ bookId: 1, status: 1 });
LoanSchema.index({ status: 1, autoRenewEnabled: 1, dueDate: 1 });
