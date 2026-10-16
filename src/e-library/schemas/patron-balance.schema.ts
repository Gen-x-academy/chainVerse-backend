import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PatronBalanceDocument = HydratedDocument<PatronBalance>;

// Materialized, per-currency running balance for a patron. This is a cache
// for fast reads and atomic increments only — the source of truth is always
// the LedgerEntry stream, and this value must always be reconcilable by
// summing LedgerEntry.amountMinorUnits for the same (patronId, currency).
@Schema({ timestamps: true })
export class PatronBalance {
  @Prop({ required: true })
  patronId: string;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true, default: 0 })
  balanceMinorUnits: number;

  @Prop({ required: true, default: 0 })
  entryCount: number;
}

export const PatronBalanceSchema = SchemaFactory.createForClass(PatronBalance);
PatronBalanceSchema.index({ patronId: 1, currency: 1 }, { unique: true });
