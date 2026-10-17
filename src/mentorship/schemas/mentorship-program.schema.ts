import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ReapplicationMode } from '../enums/mentorship.enums';

export type MentorshipProgramDocument = HydratedDocument<MentorshipProgram>;

/** Program-level rules for applying again after an application closes. */
@Schema({ _id: false })
export class ReapplicationPolicy {
  @Prop({
    type: String,
    enum: Object.values(ReapplicationMode),
    default: ReapplicationMode.AFTER_WITHDRAWAL,
  })
  mode: ReapplicationMode;

  /** Minimum hours between the previous application closing and reapplying. */
  @Prop({ type: Number, default: 0, min: 0 })
  cooldownHours: number;

  /** Maximum applications (first one included) per applicant per program. */
  @Prop({ type: Number, default: 3, min: 1 })
  maxAttempts: number;
}

export const ReapplicationPolicySchema =
  SchemaFactory.createForClass(ReapplicationPolicy);

/**
 * A mentorship offering a mentor accepts applications for.
 *
 * `reservedSeats` is only ever moved with conditional `$inc` updates so two
 * concurrent acceptances cannot both take the last seat.
 */
@Schema({ timestamps: true, collection: 'mentorship_programs' })
export class MentorshipProgram {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  mentorId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: String, default: null, maxlength: 5000 })
  description: string | null;

  @Prop({ type: Number, required: true, min: 1 })
  capacity: number;

  @Prop({ type: Number, default: 0, min: 0 })
  reservedSeats: number;

  /** New applications and reapplications are refused after this instant. */
  @Prop({ type: Date, default: null })
  applicationsCloseAt: Date | null;

  /** Applicants can no longer withdraw after this instant. */
  @Prop({ type: Date, default: null })
  withdrawalCutoffAt: Date | null;

  /**
   * Version of the consent text applicants must agree to. Bumping it forces
   * every new application — reapplications included — to collect fresh
   * consent.
   */
  @Prop({ required: true, trim: true, maxlength: 50 })
  consentVersion: string;

  @Prop({ type: ReapplicationPolicySchema, default: () => ({}) })
  reapplication: ReapplicationPolicy;

  @Prop({ type: Boolean, default: true })
  isOpen: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipProgramSchema =
  SchemaFactory.createForClass(MentorshipProgram);
