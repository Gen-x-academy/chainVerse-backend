import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Per-mentor activity counters feeding the trust indicators. Written only by
 * server-side code via `MentorTrustService.recordSignals`; no REST endpoint
 * accepts these values, so a mentor cannot award themself an indicator.
 */
@Schema({ timestamps: true, collection: 'mentor_trust_signals' })
export class MentorTrustSignals {
  @Prop({ required: true, unique: true, index: true })
  mentorId: string;

  @Prop({ default: 0 }) profileFieldsTotal: number;
  @Prop({ default: 0 }) profileFieldsCompleted: number;
  @Prop({ default: 0 }) verifiedCredentials: number;
  @Prop({ default: 0 }) responseSampleSize: number;
  @Prop({ default: 0 }) respondedWithin48h: number;
  @Prop({ default: 0 }) sessionsScheduled: number;
  @Prop({ default: 0 }) sessionsDelivered: number;
  @Prop({ default: 0 }) upheldSafetyReports: number;
}

export type MentorTrustSignalsDocument = HydratedDocument<MentorTrustSignals>;
export const MentorTrustSignalsSchema =
  SchemaFactory.createForClass(MentorTrustSignals);
