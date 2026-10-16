import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LibraryChargePaymentDocument = HydratedDocument<LibraryChargePayment>;

/**
 * Records a payment intent that binds a patron to a charge via Stellar.
 *
 * One document per payment attempt; idempotent on (chargeEntryId + transactionHash)
 * so a replayed request with the same transaction hash is rejected
 * (BIZ_PAYMENT_ALREADY_APPLIED) rather than double-posted.
 *
 * On successful on-chain verification the corresponding LedgerEntry of type
 * PAYMENT is posted and `ledgerEntryId` is populated.
 */
@Schema({ timestamps: true, collection: 'library_charge_payments' })
export class LibraryChargePayment {
  /** Patron making the payment. */
  @Prop({ required: true, index: true })
  patronId: string;

  /** ID of the LedgerEntry (charge) being settled. */
  @Prop({ required: true, index: true })
  chargeEntryId: string;

  /** Stellar asset code, e.g. 'XLM' or 'USDC'. */
  @Prop({ required: true })
  asset: string;

  /** Amount in minor currency units (e.g. cents for USD, stroops for XLM). */
  @Prop({ required: true, min: 1 })
  amountMinorUnits: number;

  /** ISO 4217 currency code, must match the charge entry's currency. */
  @Prop({ required: true })
  currency: string;

  /** Stellar public key of the receiving account. */
  @Prop({ required: true })
  destination: string;

  /** Optional Stellar memo attached to the transaction. */
  @Prop({ type: String, default: null })
  memo: string | null;

  /** Stellar transaction hash submitted by the patron. */
  @Prop({ required: true, index: true })
  transactionHash: string;

  /**
   * Whether the Stellar network confirmed the transaction.
   * Populated after on-chain verification.
   */
  @Prop({ required: true, default: false })
  verified: boolean;

  /**
   * ID of the LedgerEntry (PAYMENT type) that was posted after successful
   * verification. Null until the entry is written.
   */
  @Prop({ type: Types.ObjectId, ref: 'LedgerEntry', default: null })
  ledgerEntryId: Types.ObjectId | null;

  /** Actor who submitted the payment (patron id or 'system'). */
  @Prop({ required: true })
  submittedBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LibraryChargePaymentSchema =
  SchemaFactory.createForClass(LibraryChargePayment);

// Enforce idempotency: the same (chargeEntryId + transactionHash) can only
// appear once in the collection.
LibraryChargePaymentSchema.index(
  { chargeEntryId: 1, transactionHash: 1 },
  { unique: true },
);
LibraryChargePaymentSchema.index({ patronId: 1, createdAt: -1 });
