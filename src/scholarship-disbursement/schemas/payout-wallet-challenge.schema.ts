import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PayoutWalletChallengeDocument =
  HydratedDocument<PayoutWalletChallenge>;

/** A single-use, expiring proof-of-control challenge for a payout address. */
@Schema({ timestamps: true, collection: 'scholarship_wallet_challenges' })
export class PayoutWalletChallenge {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true })
  recipientId: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  network: string;

  @Prop({ required: true })
  nonce: string;

  /** The exact domain-separated message the wallet must sign. */
  @Prop({ required: true })
  message: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  consumedAt: Date | null;

  @Prop({ default: 0 })
  failedAttempts: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PayoutWalletChallengeSchema = SchemaFactory.createForClass(
  PayoutWalletChallenge,
);

PayoutWalletChallengeSchema.index({ organizationId: 1, recipientId: 1 });
// Purge a day after expiry; the verify path enforces `expiresAt` itself.
PayoutWalletChallengeSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 24 * 60 * 60 },
);
