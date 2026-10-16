import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { applyImmutableFields } from './immutable-fields';

export type PaymentEligibilityDocument = HydratedDocument<PaymentEligibility>;

/**
 * The single "this installment may be paid" fact for an award milestone.
 *
 * The unique `(awardId, milestoneKey)` index is the guarantee behind "approval
 * triggers at most one payment eligibility event": the event is only emitted by
 * the request whose insert succeeded. Amount and recipient are snapshotted from
 * the active schedule and award at approval time.
 */
@Schema({ timestamps: true, collection: 'scholarship_payment_eligibilities' })
export class PaymentEligibility {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  awardId: string;

  @Prop({ required: true })
  scheduleId: string;

  @Prop({ required: true })
  milestoneKey: string;

  @Prop({ required: true })
  evidenceId: string;

  @Prop({ required: true })
  decisionId: string;

  @Prop({ required: true, min: 1 })
  amountMinor: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  recipientId: string;

  @Prop({ required: true })
  recipientWallet: string;

  /** Set once a disbursement intent exists; the reconciliation job keys off null. */
  @Prop({ type: String, default: null, index: true })
  disbursementIntentId: string | null;
}

export const PaymentEligibilitySchema =
  SchemaFactory.createForClass(PaymentEligibility);

PaymentEligibilitySchema.index(
  { awardId: 1, milestoneKey: 1 },
  { unique: true },
);

applyImmutableFields(PaymentEligibilitySchema, 'PaymentEligibility', [
  'organizationId',
  'awardId',
  'scheduleId',
  'milestoneKey',
  'evidenceId',
  'decisionId',
  'amountMinor',
  'currency',
  'recipientId',
  'recipientWallet',
]);
