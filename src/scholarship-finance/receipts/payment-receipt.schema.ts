import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type {
  StellarAsset,
  StellarNetwork,
} from '../programs/scholarship-program.schema';

export type ReceiptVerificationStatus = 'verified' | 'mismatch' | 'not_found';

export interface ReceiptVerification {
  status: ReceiptVerificationStatus;
  checkedAt: Date;
  detail?: string;
}

export type PaymentReceiptDocument = HydratedDocument<PaymentReceipt>;

/**
 * Durable proof of a completed scholarship payment.
 *
 * Contains only payment facts (award/installment ids, asset, amount, network,
 * transaction, completion time). It deliberately never copies application
 * data — reasons, essays, income or identity documents stay in their own
 * domain. Core fields are written once; only `verifications` is appended to.
 */
@Schema({
  timestamps: { createdAt: 'issuedAt', updatedAt: false },
  collection: 'scholarship_payment_receipts',
})
export class PaymentReceipt {
  @Prop({ required: true, unique: true }) receiptNumber: string;
  @Prop({ required: true, index: true }) organizationId: string;
  @Prop({ required: true }) programId: string;
  @Prop({ required: true }) programName: string;
  @Prop({ required: true }) awardId: string;
  @Prop({ required: true }) installmentId: string;
  @Prop({ required: true, index: true }) recipientId: string;
  @Prop({ required: true, unique: true }) payoutIntentId: string;

  @Prop({ type: Object, required: true }) asset: StellarAsset;
  /** Integer minor units. */
  @Prop({ required: true }) amount: string;
  @Prop({ required: true }) network: StellarNetwork;

  @Prop({ required: true, unique: true }) transactionHash: string;
  @Prop({ required: true }) ledger: number;
  @Prop({ required: true }) memo: string;
  @Prop({ required: true }) sourceAccount: string;
  @Prop({ required: true }) destination: string;
  @Prop({ required: true }) completedAt: Date;

  /** Public URLs anyone can use to verify the payment independently. */
  @Prop({ type: Object, required: true })
  evidence: { horizonUrl: string; explorerUrl: string };

  @Prop({ type: [Object], default: [] }) verifications: ReceiptVerification[];

  issuedAt?: Date;
}

export const PaymentReceiptSchema =
  SchemaFactory.createForClass(PaymentReceipt);

const IMMUTABLE_FIELDS = Object.keys(PaymentReceiptSchema.paths).filter(
  (p) => !['verifications', '_id', '__v'].includes(p),
);
PaymentReceiptSchema.pre(
  ['updateOne', 'findOneAndUpdate', 'updateMany'],
  function () {
    const update = (this.getUpdate() ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const touched = Object.values(update).flatMap((ops) =>
      Object.keys(ops ?? {}),
    );
    if (touched.some((f) => IMMUTABLE_FIELDS.includes(f.split('.')[0]))) {
      throw new Error('Receipt payment facts are immutable');
    }
  },
);
PaymentReceiptSchema.pre(
  ['deleteOne', 'deleteMany', 'findOneAndDelete'],
  function () {
    throw new Error('Receipts cannot be deleted');
  },
);
