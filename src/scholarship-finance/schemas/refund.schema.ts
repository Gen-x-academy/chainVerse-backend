import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { DepositRail, RefundStatus, RefundType } from '../domain/finance.enums';

@Schema({ _id: false })
export class RefundDestination {
  @Prop({ required: true, enum: Object.values(DepositRail) })
  rail: DepositRail;

  /** Destination account reference. For privacy, store a tokenized/masked reference for fiat rails. */
  @Prop({ required: true })
  account: string;
}

export const RefundDestinationSchema =
  SchemaFactory.createForClass(RefundDestination);

export type RefundDocument = HydratedDocument<Refund>;

@Schema({ timestamps: true, collection: 'scholarship_refunds' })
export class Refund {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true, enum: Object.values(RefundType) })
  type: RefundType;

  @Prop({ type: String, default: null })
  depositId: string | null;

  @Prop({ required: true })
  sponsorId: string;

  /** Fund the refund is drawn from; null = unrestricted pool. */
  @Prop({ type: String, default: null })
  programId: string | null;

  @Prop({ required: true })
  assetKey: string;

  @Prop({ required: true, min: 1 })
  amountMinor: number;

  @Prop({ required: true })
  reason: string;

  /** Not required for rejected transfers — the rail already returned the funds. */
  @Prop({ type: RefundDestinationSchema, default: null })
  destination: RefundDestination | null;

  @Prop({
    required: true,
    enum: Object.values(RefundStatus),
    default: RefundStatus.REQUESTED,
  })
  status: RefundStatus;

  @Prop({ required: true })
  requestedBy: string;

  @Prop({ type: String, default: null })
  approvedBy: string | null;

  @Prop({ type: Date, default: null })
  approvedAt: Date | null;

  /** Journal posted on approval (reservation, or full deposit reversal). */
  @Prop({ type: String, default: null })
  approvalJournalId: string | null;

  @Prop({ type: String, default: null })
  payoutJournalId: string | null;

  @Prop({ type: String, default: null })
  payoutReference: string | null;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  @Prop({ type: String, default: null })
  resolutionReason: string | null;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);
RefundSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
RefundSchema.index({ organizationId: 1, depositId: 1 });
