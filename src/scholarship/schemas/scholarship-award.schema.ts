import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ScholarshipAwardStatus } from '../scholarship.constants';
import { applyImmutableFields } from './immutable-fields';

export type ScholarshipAwardDocument = HydratedDocument<ScholarshipAward>;

/**
 * A funded award to one recipient, owned by one organization (tenant).
 *
 * Amount, currency and recipient are fixed at creation: milestone schedules
 * split this total and disbursement intents snapshot these values, so a change
 * here would silently invalidate both.
 */
@Schema({ timestamps: true, collection: 'scholarship_awards' })
export class ScholarshipAward {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  recipientId: string;

  /** Stellar account that receives disbursements. */
  @Prop({ required: true })
  recipientWallet: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  /** Asset code, e.g. `USDC` or `XLM`. */
  @Prop({ required: true, uppercase: true })
  currency: string;

  /** Total award in integer minor units. */
  @Prop({ required: true, min: 1 })
  totalAmountMinor: number;

  @Prop({ type: Date, default: null })
  periodStart: Date | null;

  @Prop({ type: Date, default: null })
  periodEnd: Date | null;

  @Prop({
    type: String,
    enum: Object.values(ScholarshipAwardStatus),
    default: ScholarshipAwardStatus.ACTIVE,
  })
  status: ScholarshipAwardStatus;

  @Prop({ required: true })
  createdBy: string;
}

export const ScholarshipAwardSchema =
  SchemaFactory.createForClass(ScholarshipAward);

ScholarshipAwardSchema.index({ organizationId: 1, createdAt: -1 });

applyImmutableFields(ScholarshipAwardSchema, 'ScholarshipAward', [
  'organizationId',
  'recipientId',
  'recipientWallet',
  'currency',
  'totalAmountMinor',
  'createdBy',
]);
