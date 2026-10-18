import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MentorshipMilestoneDocument = HydratedDocument<MentorshipMilestone>;

export enum MilestoneStatus {
  NOT_STARTED = 'not_started',
  BLOCKED = 'blocked',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true, collection: 'mentorship_milestones' })
export class MentorshipMilestone {
  @Prop({ required: true, index: true })
  engagementId: string;

  @Prop({ required: true, index: true })
  goalId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: null })
  description: string | null;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ type: [String], default: [] })
  dependencies: string[];

  @Prop({ default: null })
  reviewerId: string | null;

  @Prop({
    required: true,
    enum: MilestoneStatus,
    default: MilestoneStatus.NOT_STARTED,
  })
  status: MilestoneStatus;

  @Prop({ required: true, default: false })
  blocked: boolean;

  @Prop({ default: null })
  paymentLinkageId: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipMilestoneSchema =
  SchemaFactory.createForClass(MentorshipMilestone);
MentorshipMilestoneSchema.index({ goalId: 1, dependencies: 1 });
MentorshipMilestoneSchema.index({ engagementId: 1, dueDate: 1 });
