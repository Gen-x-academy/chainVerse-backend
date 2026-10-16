import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PayoutWalletDocument = HydratedDocument<PayoutWallet>;

export enum PayoutWalletStatus {
  /** Ownership proven; the address payouts are sent to. */
  VERIFIED = 'verified',
  /** Replaced by a newer verified address; kept for payout history. */
  SUPERSEDED = 'superseded',
}

/**
 * A recipient's proven Stellar payout address within one organization. Rows
 * only exist once a signed challenge has been verified, so "has a wallet"
 * always means "has proven control of it".
 */
@Schema({ timestamps: true, collection: 'scholarship_payout_wallets' })
export class PayoutWallet {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true })
  recipientId: string;

  @Prop({ required: true })
  address: string;

  @Prop({
    type: String,
    enum: Object.values(PayoutWalletStatus),
    default: PayoutWalletStatus.VERIFIED,
  })
  status: PayoutWalletStatus;

  @Prop({ required: true })
  verifiedAt: Date;

  /** Challenge whose signature proved ownership. */
  @Prop({ required: true })
  challengeId: string;

  @Prop({ type: Date, default: null })
  supersededAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PayoutWalletSchema = SchemaFactory.createForClass(PayoutWallet);

// One verified address per recipient per organization.
PayoutWalletSchema.index(
  { organizationId: 1, recipientId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: PayoutWalletStatus.VERIFIED },
  },
);
PayoutWalletSchema.index({ organizationId: 1, recipientId: 1, createdAt: -1 });
