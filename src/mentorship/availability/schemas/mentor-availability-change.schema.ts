import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MentorAvailabilityStatus } from '../availability.machine';

/**
 * One scheduled or applied availability change. Rows are append-only: a later
 * change supersedes an earlier one by `effectiveFrom`, so history stays intact
 * and a future change activates without any background job.
 */
@Schema({ timestamps: true, collection: 'mentor_availability_changes' })
export class MentorAvailabilityChange {
  @Prop({ required: true, index: true })
  mentorId: string;

  @Prop({ required: true, enum: MentorAvailabilityStatus })
  status: MentorAvailabilityStatus;

  @Prop({ required: true, type: Date })
  effectiveFrom: Date;

  @Prop({ type: Number, default: null })
  maxActiveMentees: number | null;

  @Prop({ default: '' })
  note: string;

  /** Client-supplied; makes retries of the same change a no-op. */
  @Prop({ required: true })
  idempotencyKey: string;

  /** Stable fingerprint of the request, to detect key reuse with new content. */
  @Prop({ required: true })
  fingerprint: string;

  @Prop({ required: true })
  changedBy: string;

  /** Monotonic per mentor; breaks ties between equal `effectiveFrom`. */
  @Prop({ required: true })
  sequence: number;
}

export type MentorAvailabilityChangeDocument =
  HydratedDocument<MentorAvailabilityChange>;
export const MentorAvailabilityChangeSchema = SchemaFactory.createForClass(
  MentorAvailabilityChange,
);
MentorAvailabilityChangeSchema.index(
  { mentorId: 1, idempotencyKey: 1 },
  { unique: true },
);
MentorAvailabilityChangeSchema.index({ mentorId: 1, effectiveFrom: -1 });
