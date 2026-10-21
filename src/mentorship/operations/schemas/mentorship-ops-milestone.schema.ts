import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MilestoneStatus } from '../enums/mentorship-operations.enums';

export type MentorshipOpsMilestoneDocument =
  HydratedDocument<MentorshipOpsMilestone>;

/**
 * A dated milestone agreed for an engagement (e.g. "first review landed").
 * The background workflow flips pending milestones past their due date to
 * `overdue`, which both dashboards surface.
 */
@Schema({ timestamps: true, collection: 'mentorship_ops_milestones' })
export class MentorshipOpsMilestone {
  @Prop({ required: true, index: true })
  engagementId!: string;

  @Prop({ required: true, index: true })
  programId!: string;

  @Prop({ required: true, index: true })
  mentorId!: string;

  @Prop({ required: true, index: true })
  menteeId!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(MilestoneStatus),
    default: MilestoneStatus.PENDING,
    index: true,
  })
  status!: MilestoneStatus;

  @Prop({ required: true, type: Date, index: true })
  dueAt!: Date;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipOpsMilestoneSchema = SchemaFactory.createForClass(
  MentorshipOpsMilestone,
);

MentorshipOpsMilestoneSchema.index({ status: 1, dueAt: 1 });
MentorshipOpsMilestoneSchema.index({ engagementId: 1, status: 1 });
