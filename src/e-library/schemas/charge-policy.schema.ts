import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ChargeType } from '../enums/charge-type.enum';

export type ChargePolicyDocument = HydratedDocument<ChargePolicy>;

// A versioned, time-bounded set of money rules for a given charge type.
// Loan/overdue services must never hardcode rates, caps or grace periods —
// they always ask ChargePolicyService for the policy effective at a given date.
@Schema({ timestamps: true })
export class ChargePolicy {
  @Prop({ required: true, type: String, enum: ChargeType })
  chargeType: ChargeType;

  // ISO 4217 currency code, e.g. 'USD'.
  @Prop({ required: true })
  currency: string;

  @Prop({ required: true, default: 0, min: 0 })
  graceDays: number;

  @Prop({ required: true, min: 0 })
  dailyRateMinorUnits: number;

  @Prop({ required: true, min: 0 })
  capMinorUnits: number;

  @Prop({ required: true })
  effectiveFrom: Date;

  // Null means "open-ended / currently effective". Set automatically when a
  // newer policy of the same chargeType+currency is created.
  @Prop({ type: Date, default: null })
  effectiveTo: Date | null;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true })
  createdBy: string;
}

export const ChargePolicySchema = SchemaFactory.createForClass(ChargePolicy);
ChargePolicySchema.index({ chargeType: 1, currency: 1, effectiveFrom: -1 });
