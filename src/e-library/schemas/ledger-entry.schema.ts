import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LedgerEntryType } from '../enums/ledger-entry-type.enum';

export type LedgerEntryDocument = HydratedDocument<LedgerEntry>;

// Append-only record of a single charge, payment, waiver, refund or
// adjustment against a patron's account. Entries are never updated or
// deleted — corrections are made by posting a new compensating entry that
// references the entry it corrects via `referenceEntryId`.
@Schema({ timestamps: true })
export class LedgerEntry {
  @Prop({ required: true })
  patronId: string;

  @Prop({ type: String, default: null })
  loanId: string | null;

  @Prop({ required: true, type: String, enum: LedgerEntryType })
  entryType: LedgerEntryType;

  // Signed amount in minor currency units. Positive increases the patron's
  // balance owed (charges); negative decreases it (payments, waivers,
  // refunds). Adjustments may be either sign.
  @Prop({ required: true })
  amountMinorUnits: number;

  // Explicit ISO 4217 currency code — balances are always scoped per currency.
  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  balanceBeforeMinorUnits: number;

  @Prop({ required: true })
  balanceAfterMinorUnits: number;

  @Prop({ required: true })
  reason: string;

  // For compensating entries (waiver/refund/adjustment), the id of the
  // original charge entry being corrected.
  @Prop({ type: String, default: null })
  referenceEntryId: string | null;

  // Actor who caused this entry to be posted (staff id for staff-initiated
  // entries, 'system' for scheduler-generated fines).
  @Prop({ required: true })
  createdBy: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;
}

export const LedgerEntrySchema = SchemaFactory.createForClass(LedgerEntry);
LedgerEntrySchema.index({ patronId: 1, currency: 1, createdAt: 1 });
LedgerEntrySchema.index({ referenceEntryId: 1 });
LedgerEntrySchema.index({ loanId: 1 });

const IMMUTABLE_ERROR =
  'LedgerEntry records are append-only and cannot be modified or deleted';

LedgerEntrySchema.pre('updateOne', function blockUpdate() {
  throw new Error(IMMUTABLE_ERROR);
});
LedgerEntrySchema.pre('updateMany', function blockUpdateMany() {
  throw new Error(IMMUTABLE_ERROR);
});
LedgerEntrySchema.pre('findOneAndUpdate', function blockFindOneAndUpdate() {
  throw new Error(IMMUTABLE_ERROR);
});
LedgerEntrySchema.pre('deleteOne', function blockDeleteOne() {
  throw new Error(IMMUTABLE_ERROR);
});
LedgerEntrySchema.pre('deleteMany', function blockDeleteMany() {
  throw new Error(IMMUTABLE_ERROR);
});
LedgerEntrySchema.pre('findOneAndDelete', function blockFindOneAndDelete() {
  throw new Error(IMMUTABLE_ERROR);
});
