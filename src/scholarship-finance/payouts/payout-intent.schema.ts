import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type {
  StellarAsset,
  StellarNetwork,
} from '../programs/scholarship-program.schema';
import type {
  PayoutFailureDiagnosis,
  StellarResultCodes,
} from './payout-failure.classifier';

export type PayoutStatus =
  | 'pending'
  | 'submitted'
  | 'failed'
  | 'succeeded'
  | 'cancelled';
export type PayoutAttemptStatus =
  | 'ready'
  | 'submitted'
  | 'failed'
  | 'succeeded'
  | 'abandoned';

/**
 * One transaction envelope built for the intent. A retry always creates a
 * new attempt (new envelope, new hash) — the intent, amount and memo stay
 * the same so the payment can be traced end-to-end.
 */
export interface PayoutAttempt {
  attemptId: string;
  number: number;
  status: PayoutAttemptStatus;
  destination: string;
  /** Latest ledger close time at which the envelope may be included (tx time bound). */
  validUntil: Date;
  createdAt: Date;
  createdBy: string;
  submittedAt?: Date;
  envelopeHash?: string;
  transactionHash?: string;
  resultCodes?: StellarResultCodes;
  signerError?: string;
  failure?: PayoutFailureDiagnosis;
  ledger?: number;
  completedAt?: Date;
}

export type PayoutIntentDocument = HydratedDocument<PayoutIntent>;

/**
 * The durable intent to pay one award installment. Exactly one intent exists
 * per (organization, award, installment); failures never delete it and never
 * touch the award or its payable balance, so eligibility is preserved.
 */
@Schema({
  timestamps: true,
  collection: 'scholarship_payout_intents',
  optimisticConcurrency: true,
})
export class PayoutIntent {
  @Prop({ required: true }) organizationId: string;
  @Prop({ required: true, index: true }) programId: string;
  @Prop({ required: true }) awardId: string;
  @Prop({ required: true }) installmentId: string;
  @Prop({ required: true, index: true }) recipientId: string;

  @Prop({ required: true }) destination: string;
  @Prop({ type: Object, required: true }) asset: StellarAsset;
  @Prop({ required: true }) network: StellarNetwork;
  /** Integer minor units. */
  @Prop({ required: true }) amount: string;
  /** Stellar text memo shared by every attempt of this intent (≤ 28 bytes). */
  @Prop({ required: true }) memo: string;

  @Prop({ required: true, default: 'pending', index: true })
  status: PayoutStatus;

  @Prop({ type: [Object], default: [] }) attempts: PayoutAttempt[];

  @Prop({ type: Object, default: null })
  lastFailure?: PayoutFailureDiagnosis | null;
  @Prop({ type: Date, default: null, index: true }) nextRetryAt?: Date | null;

  @Prop({ type: [Object], default: [] })
  destinationHistory: {
    from: string;
    to: string;
    changedBy: string;
    changedAt: Date;
    note?: string;
  }[];

  @Prop() cancelledReason?: string;
  @Prop() ledgerEntryId?: string;
  @Prop() receiptId?: string;
  @Prop({ required: true }) createdBy: string;
}

export const PayoutIntentSchema = SchemaFactory.createForClass(PayoutIntent);

PayoutIntentSchema.index(
  { organizationId: 1, awardId: 1, installmentId: 1 },
  { unique: true },
);
PayoutIntentSchema.index({ 'attempts.transactionHash': 1 }, { sparse: true });
PayoutIntentSchema.index({ 'attempts.envelopeHash': 1 }, { sparse: true });
