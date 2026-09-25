import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { DisbursementIntentStatus } from '../scholarship.constants';
import { applyImmutableFields } from './immutable-fields';

export type DisbursementIntentDocument = HydratedDocument<DisbursementIntent>;

@Schema({ _id: false })
export class IntentTransition {
  @Prop({ type: String, enum: Object.values(DisbursementIntentStatus) })
  from: DisbursementIntentStatus;

  @Prop({ type: String, enum: Object.values(DisbursementIntentStatus) })
  to: DisbursementIntentStatus;

  @Prop({ required: true })
  actorId: string;

  @Prop({ type: String, default: null })
  externalReference: string | null;

  @Prop({ type: String, default: null })
  reason: string | null;

  @Prop({ required: true })
  at: Date;
}

export const IntentTransitionSchema =
  SchemaFactory.createForClass(IntentTransition);

/**
 * One stable payment intent per award installment, created before any external
 * execution. `intentKey` is derived from `(organizationId, awardId,
 * milestoneKey)` and uniquely indexed, so however many times creation is
 * retried — by the event listener, the reconciliation job or an operator —
 * exactly one intent can exist per installment.
 */
@Schema({ timestamps: true, collection: 'scholarship_disbursement_intents' })
export class DisbursementIntent {
  @Prop({ required: true, unique: true })
  intentKey: string;

  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  awardId: string;

  @Prop({ required: true })
  milestoneKey: string;

  @Prop({ required: true, unique: true })
  eligibilityId: string;

  @Prop({ required: true, min: 1 })
  amountMinor: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  recipientId: string;

  @Prop({ required: true })
  recipientWallet: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(DisbursementIntentStatus),
    default: DisbursementIntentStatus.CREATED,
  })
  status: DisbursementIntentStatus;

  /** Executor handle for the current attempt (e.g. Stellar tx hash). */
  @Prop({ type: String, default: null })
  externalReference: string | null;

  /** Number of times the intent has been handed to an executor. */
  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: String, default: null })
  lastFailureReason: string | null;

  @Prop({ type: [IntentTransitionSchema], default: [] })
  transitions: IntentTransition[];

  @Prop({ required: true })
  createdBy: string;
}

export const DisbursementIntentSchema =
  SchemaFactory.createForClass(DisbursementIntent);

DisbursementIntentSchema.index({ status: 1, updatedAt: 1 });

applyImmutableFields(DisbursementIntentSchema, 'DisbursementIntent', [
  'intentKey',
  'organizationId',
  'awardId',
  'milestoneKey',
  'eligibilityId',
  'amountMinor',
  'currency',
  'recipientId',
  'recipientWallet',
  'createdBy',
]);
