import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LEDGER_ACCOUNTS, LEDGER_ENTRY_TYPES } from './ledger-accounts';
import type { LedgerAccount, LedgerEntryType } from './ledger-accounts';

export interface LedgerLine {
  account: LedgerAccount;
  direction: 'debit' | 'credit';
  /** Integer minor units (stroops) as a string. */
  amount: string;
}

export type LedgerEntryDocument = HydratedDocument<LedgerEntry>;

/**
 * Immutable journal entry. Entries are append-only: mistakes are corrected
 * with a `reversal` (and, if needed, a new entry), never by editing history.
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'scholarship_ledger_entries',
})
export class LedgerEntry {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true })
  programId: string;

  /** Caller-supplied business reference; unique per organization. */
  @Prop({ required: true })
  reference: string;

  @Prop({ required: true, enum: LEDGER_ENTRY_TYPES })
  entryType: LedgerEntryType;

  @Prop({
    type: [
      {
        _id: false,
        account: { type: String, enum: LEDGER_ACCOUNTS, required: true },
        direction: { type: String, enum: ['debit', 'credit'], required: true },
        amount: { type: String, required: true },
      },
    ],
    required: true,
  })
  lines: LedgerLine[];

  /** Sum of debit lines (== sum of credit lines), minor units. */
  @Prop({ required: true })
  totalAmount: string;

  @Prop({ required: true })
  assetCode: string;

  @Prop({ required: true })
  description: string;

  /** Mandatory justification for adjustments and reversals. */
  @Prop()
  reason?: string;

  @Prop() awardId?: string;
  @Prop() installmentId?: string;
  @Prop() payoutIntentId?: string;

  /** On-chain transaction evidence for funding, disbursement, refund, recovery. */
  @Prop() transactionHash?: string;

  /** Set on a reversal entry: the id of the entry it reverses. */
  @Prop() reversalOf?: string;

  @Prop({ required: true })
  effectiveAt: Date;

  @Prop({ required: true })
  postedBy: string;

  /** Hash of the normalised request, used to make replays idempotent. */
  @Prop({ required: true, select: false })
  requestHash: string;

  createdAt?: Date;
}

export const LedgerEntrySchema = SchemaFactory.createForClass(LedgerEntry);

LedgerEntrySchema.index({ organizationId: 1, reference: 1 }, { unique: true });
LedgerEntrySchema.index({ programId: 1, effectiveAt: 1, _id: 1 });
LedgerEntrySchema.index({ reversalOf: 1 }, { unique: true, sparse: true });
LedgerEntrySchema.index({ programId: 1, awardId: 1 }, { sparse: true });

const blockMutation = function () {
  throw new Error('Ledger entries are immutable; post a reversal instead');
};
for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const) {
  LedgerEntrySchema.pre(op, blockMutation);
}
LedgerEntrySchema.pre('save', function () {
  if (!this.isNew) blockMutation();
});
