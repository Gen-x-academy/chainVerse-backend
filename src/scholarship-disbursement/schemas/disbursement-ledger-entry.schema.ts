import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DisbursementLedgerEntryDocument =
  HydratedDocument<DisbursementLedgerEntry>;

export enum LedgerEntryType {
  PAYOUT = 'payout',
  REVERSAL = 'reversal',
}

/**
 * Append-only accounting record written when a payment finalizes or is
 * reversed. The unique `(paymentId, type)` index is the last line of defence
 * against double finalization: even if two workers passed the status
 * compare-and-set, only one ledger entry can exist.
 */
@Schema({ timestamps: true, collection: 'scholarship_ledger_entries' })
export class DisbursementLedgerEntry {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  paymentId: string;

  @Prop({ type: String, required: true, enum: Object.values(LedgerEntryType) })
  type: LedgerEntryType;

  @Prop({ required: true })
  recipientId: string;

  @Prop({ required: true })
  amount: string;

  @Prop({ required: true })
  assetCode: string;

  @Prop({ type: String, default: null })
  assetIssuer: string | null;

  @Prop({ required: true })
  network: string;

  @Prop({ required: true })
  txHash: string;

  @Prop({ required: true })
  ledger: number;

  @Prop({ required: true })
  operationId: string;

  createdAt?: Date;
}

export const DisbursementLedgerEntrySchema = SchemaFactory.createForClass(
  DisbursementLedgerEntry,
);

DisbursementLedgerEntrySchema.index(
  { paymentId: 1, type: 1 },
  { unique: true },
);
DisbursementLedgerEntrySchema.index({ txHash: 1, type: 1 }, { unique: true });
