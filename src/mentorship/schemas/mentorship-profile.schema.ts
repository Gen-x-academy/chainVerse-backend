import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ParticipantRole } from '../mentorship.constants';

export type MentorshipProfileDocument = HydratedDocument<MentorshipProfile>;

/**
 * A user's opt-in to mentorship on one side of a match.
 *
 * `eligible` is the hard eligibility flag: mentors start ineligible until a
 * coordinator approves them; mentees start eligible. `reservedSlots` counts
 * active engagements plus pending proposals holding a capacity reservation.
 */
@Schema({ timestamps: true, collection: 'mentorship_profiles' })
export class MentorshipProfile {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: Object.values(ParticipantRole) })
  kind!: ParticipantRole;

  @Prop({ type: [String], default: [] })
  focusAreas!: string[];

  @Prop({ type: [String], default: [] })
  programIds!: string[];

  @Prop({ required: true, default: false })
  eligible!: boolean;

  @Prop({ type: String, default: null })
  eligibilityReason!: string | null;

  @Prop({ type: String, default: null })
  eligibilityChangedBy!: string | null;

  /** Mentor only: whether they currently welcome new mentees (soft check). */
  @Prop({ default: true })
  acceptingMentees!: boolean;

  /** Mentor only: hard capacity ceiling. */
  @Prop({ default: 3, min: 0 })
  maxActiveMentees!: number;

  /** Mentor only: slots held by engagements and approved-in-progress proposals. */
  @Prop({ default: 0, min: 0 })
  reservedSlots!: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipProfileSchema =
  SchemaFactory.createForClass(MentorshipProfile);

MentorshipProfileSchema.index({ userId: 1, kind: 1 }, { unique: true });
