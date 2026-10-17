import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  PaymentHoldReason,
  ScholarshipPaymentStatus,
} from '../domain/payment-state';

export type ScholarshipPaymentDocument = HydratedDocument<ScholarshipPayment>;

/** One network submission for a payment. Retries append a new attempt. */
export class PaymentAttempt {
  txHash: string;
  destination: string;
  sourceAccount: string;
  submittedAt: Date;
  /** Transaction `maxTime`; after it passes the tx can never be included. */
  maxTime: Date;
  outcome: ScholarshipPaymentStatus | null;
  error: string | null;
}

/** Where a finalized payment (or its reversal) lives on the ledger. */
export class LedgerReference {
  txHash: string;
  ledger: number;
  operationId: string;
  pagingToken: string | null;
  closedAt: Date | null;
}

/**
 * A scheduled scholarship installment and its on-chain lifecycle. The status
 * field is authoritative; every transition is a compare-and-set on it.
 */
@Schema({ timestamps: true, collection: 'scholarship_payments' })
export class ScholarshipPayment {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true })
  programId: string;

  @Prop({ required: true })
  recipientId: string;

  @Prop({ required: true })
  assetId: string;

  /** Canonical 7-decimal amount string, as Horizon reports it. */
  @Prop({ required: true })
  amount: string;

  @Prop({ required: true })
  dueAt: Date;

  /** Caller-supplied key; one payment per key per organization. */
  @Prop({ required: true })
  externalReference: string;

  @Prop({
    type: String,
    enum: Object.values(ScholarshipPaymentStatus),
    default: ScholarshipPaymentStatus.SCHEDULED,
  })
  status: ScholarshipPaymentStatus;

  @Prop({ type: String, enum: Object.values(PaymentHoldReason), default: null })
  holdReason: PaymentHoldReason | null;

  /** Current (latest) submission. Cleared when a payment is retried. */
  @Prop({ type: String, default: null })
  txHash: string | null;

  @Prop({ type: String, default: null })
  destination: string | null;

  /** Treasury account that signed the current submission. */
  @Prop({ type: String, default: null })
  sourceAccount: string | null;

  /** Base64 hash memo binding the transaction to this payment attempt. */
  @Prop({ type: String, default: null })
  memo: string | null;

  @Prop({ type: Date, default: null })
  submittedAt: Date | null;

  @Prop({ type: Date, default: null })
  txMaxTime: Date | null;

  /** Ledger the transaction was included in, once seen. */
  @Prop({ type: Number, default: null })
  includedLedger: number | null;

  @Prop({ type: Number, default: 0 })
  confirmations: number;

  @Prop({ type: Number, default: null })
  requiredConfirmations: number | null;

  @Prop({ type: Date, default: null })
  finalizedAt: Date | null;

  @Prop({ type: Object, default: null })
  ledgerReference: LedgerReference | null;

  @Prop({ type: Object, default: null })
  reversalReference: LedgerReference | null;

  @Prop({ type: String, default: null })
  reversalReason: string | null;

  @Prop({ type: [Object], default: [] })
  attempts: PaymentAttempt[];

  /** Last non-terminal problem (e.g. missing trustline) the executor saw. */
  @Prop({ type: String, default: null })
  lastError: string | null;

  /** Executor lease; a claim is only honoured until `leaseUntil`. */
  @Prop({ type: String, default: null })
  leaseOwner: string | null;

  @Prop({ type: Date, default: null })
  leaseUntil: Date | null;

  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ScholarshipPaymentSchema =
  SchemaFactory.createForClass(ScholarshipPayment);

ScholarshipPaymentSchema.index(
  { organizationId: 1, externalReference: 1 },
  { unique: true },
);
// A transaction hash can back exactly one payment.
ScholarshipPaymentSchema.index(
  { txHash: 1 },
  { unique: true, partialFilterExpression: { txHash: { $type: 'string' } } },
);
// Executor scan: due scheduled installments, oldest first.
ScholarshipPaymentSchema.index({ status: 1, dueAt: 1 });
ScholarshipPaymentSchema.index({
  organizationId: 1,
  recipientId: 1,
  status: 1,
});
