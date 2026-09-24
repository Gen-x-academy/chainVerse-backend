import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LedgerBalanceDocument = HydratedDocument<LedgerBalance>;

/**
 * Materialized running balance per account. Updated with guarded atomic
 * `$inc` so concurrent postings cannot drive an account negative. The
 * integrity job recomputes these from journals to detect drift.
 */
@Schema({ timestamps: true, collection: 'scholarship_ledger_balances' })
export class LedgerBalance {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true })
  account: string;

  @Prop({ required: true })
  assetKey: string;

  @Prop({ required: true, default: 0 })
  balanceMinor: number;
}

export const LedgerBalanceSchema = SchemaFactory.createForClass(LedgerBalance);
LedgerBalanceSchema.index(
  { organizationId: 1, account: 1, assetKey: 1 },
  { unique: true },
);
