import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { FeeEvent, FeeKind, RoundingMode } from '../domain/finance.enums';

@Schema({ _id: false })
export class FeeRule {
  @Prop({ required: true, enum: Object.values(FeeKind) })
  kind: FeeKind;

  @Prop({ required: true, enum: Object.values(FeeEvent) })
  appliesTo: FeeEvent;

  @Prop({ required: true, min: 0, max: 10000 })
  basisPoints: number;

  @Prop({ required: true, min: 0 })
  fixedMinor: number;

  @Prop({ type: Number, default: null })
  minMinor: number | null;

  @Prop({ type: Number, default: null })
  maxMinor: number | null;
}

export const FeeRuleSchema = SchemaFactory.createForClass(FeeRule);

export type FeeScheduleDocument = HydratedDocument<FeeSchedule>;

/**
 * Immutable, versioned fee configuration per tenant and asset. Changing fees
 * means publishing a new version; every credited deposit records the exact
 * schedule id + version used so historical amounts stay explainable.
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'scholarship_fee_schedules',
})
export class FeeSchedule {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true })
  assetKey: string;

  @Prop({ required: true, min: 1 })
  version: number;

  @Prop({ required: true })
  effectiveFrom: Date;

  @Prop({ required: true, enum: Object.values(RoundingMode) })
  rounding: RoundingMode;

  @Prop({ type: [FeeRuleSchema], default: [] })
  rules: FeeRule[];

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  createdBy: string;
}

export const FeeScheduleSchema = SchemaFactory.createForClass(FeeSchedule);
FeeScheduleSchema.index(
  { organizationId: 1, assetKey: 1, version: 1 },
  { unique: true },
);
FeeScheduleSchema.index({ organizationId: 1, assetKey: 1, effectiveFrom: -1 });
