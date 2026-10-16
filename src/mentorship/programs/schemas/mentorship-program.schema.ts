import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MentorshipProgramDocument = HydratedDocument<MentorshipProgram>;

export const PROGRAM_STATUSES = ['draft', 'open', 'closed'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

@Schema({ collection: 'mentorship_programs', timestamps: true })
export class MentorshipProgram {
  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: String, default: '', maxlength: 5000 })
  description: string;

  /** User id of the program owner (tutor/mentor or admin who created it). */
  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true, enum: PROGRAM_STATUSES, default: 'draft' })
  status: ProgramStatus;

  @Prop({ type: Date, default: null })
  applicationOpensAt: Date | null;

  @Prop({ type: Date, default: null })
  applicationClosesAt: Date | null;

  /** Days from submission to the default review due date. */
  @Prop({ required: true, min: 1, max: 90, default: 7 })
  reviewSlaDays: number;

  /** Latest published ApplicationFormVersion.version (null until first publish). */
  @Prop({ type: Number, default: null })
  currentFormVersion: number | null;

  /** Latest EligibilityRuleSet.version (0 = no program-specific rules yet). */
  @Prop({ type: Number, default: 0 })
  currentRuleSetVersion: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipProgramSchema = SchemaFactory.createForClass(MentorshipProgram);
