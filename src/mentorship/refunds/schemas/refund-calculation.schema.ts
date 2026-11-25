import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { CancellationPolicySnapshot, CancelledBy } from '../refund-policy';

export enum RefundStatus {
  CALCULATED = 'calculated',
  EXCEPTION_PENDING = 'exception_pending',
  EXCEPTION_APPROVED = 'exception_approved',
  EXCEPTION_REJECTED = 'exception_rejected',
  TRANSFERRED = 'transferred',
}

@Schema({ _id: false })
export class RefundException {
  @Prop({ required: true }) requestedBy!: string;
  @Prop({ required: true }) reason!: string;
  @Prop({ required: true }) requestedRefundBps!: number;
  @Prop({ type: Date, required: true }) requestedAt!: Date;
  @Prop({ type: String, default: null }) decidedBy!: string | null;
  @Prop({ type: Date, default: null }) decidedAt!: Date | null;
  @Prop({ type: String, default: null }) decisionNote!: string | null;
}
const RefundExceptionSchema = SchemaFactory.createForClass(RefundException);

@Schema({ timestamps: true, collection: 'mentorship_refund_calculations' })
export class RefundCalculation {
  @Prop({ required: true, index: true }) agreementId!: string;
  @Prop({ required: true }) idempotencyKey!: string;
  @Prop({ required: true }) heldAmountMinor!: number;
  @Prop({ required: true }) currency!: string;
  @Prop({ type: Date, required: true }) sessionStart!: Date;
  @Prop({ type: Date, required: true }) cancelledAt!: Date;
  @Prop({ required: true, enum: ['learner', 'mentor', 'system'] }) cancelledBy!: CancelledBy;
  /** Snapshot taken when the booking was made; never re-read from live policy. */
  @Prop({ type: Object, required: true }) policy!: CancellationPolicySnapshot;
  @Prop({ required: true }) refundMinor!: number;
  @Prop({ required: true }) retainedMinor!: number;
  @Prop({ required: true }) refundBps!: number;
  @Prop({ required: true }) rule!: string;
  @Prop({ required: true, enum: RefundStatus, default: RefundStatus.CALCULATED })
  status!: RefundStatus;
  @Prop({ type: RefundExceptionSchema, default: null }) exception!: RefundException | null;
  /** Stable transfer id, derived from this document; the idempotency key for the payout. */
  @Prop({ type: String, default: null }) transferId!: string | null;
  @Prop({ type: Date, default: null }) transferredAt!: Date | null;
}
export type RefundCalculationDocument = HydratedDocument<RefundCalculation>;
export const RefundCalculationSchema = SchemaFactory.createForClass(RefundCalculation);
RefundCalculationSchema.index({ agreementId: 1, idempotencyKey: 1 }, { unique: true });
