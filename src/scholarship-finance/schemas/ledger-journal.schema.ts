import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LedgerSourceType } from '../domain/finance.enums';

@Schema({ _id: false })
export class LedgerLine {
  @Prop({ required: true })
  account: string;

  @Prop({ required: true, min: 0 })
  debitMinor: number;

  @Prop({ required: true, min: 0 })
  creditMinor: number;
}

export const LedgerLineSchema = SchemaFactory.createForClass(LedgerLine);

export type LedgerJournalDocument = HydratedDocument<LedgerJournal>;

/**
 * One balanced double-entry journal. Journals are append-only: corrections
 * are made by posting a new journal with `reversalOf` set, never by
 * updating or deleting an existing one.
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'scholarship_ledger_journals',
})
export class LedgerJournal {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  assetKey: string;

  /** Deterministic key per business event; the unique index blocks double posting. */
  @Prop({ required: true, unique: true })
  idempotencyKey: string;

  @Prop({ required: true, enum: Object.values(LedgerSourceType) })
  sourceType: LedgerSourceType;

  @Prop({ required: true })
  sourceId: string;

  @Prop({ type: [LedgerLineSchema], required: true })
  lines: LedgerLine[];

  @Prop({ type: String, default: null })
  reversalOf: string | null;

  @Prop({ type: String, default: null })
  reversedBy: string | null;

  @Prop({ required: true })
  memo: string;

  @Prop({ required: true })
  postedBy: string;
}

export const LedgerJournalSchema = SchemaFactory.createForClass(LedgerJournal);
LedgerJournalSchema.index({ organizationId: 1, sourceType: 1, sourceId: 1 });
LedgerJournalSchema.index({
  organizationId: 1,
  assetKey: 1,
  'lines.account': 1,
});
