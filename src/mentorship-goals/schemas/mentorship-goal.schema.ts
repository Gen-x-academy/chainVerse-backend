import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MentorshipGoalDocument = HydratedDocument<MentorshipGoal>;

export enum GoalVisibility {
  ENGAGEMENT = 'engagement',
  PRIVATE = 'private',
}

export enum GoalStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * Engagement goal with measurable success criteria and linkage to an agreement.
 * Revisions are versioned; evidence remains associated with completed goals.
 */
@Schema({ timestamps: true, collection: 'mentorship_goals' })
export class MentorshipGoal {
  @Prop({ required: true, index: true })
  engagementId: string;

  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: null })
  description: string | null;

  @Prop({
    required: true,
    enum: GoalVisibility,
    default: GoalVisibility.ENGAGEMENT,
  })
  visibility: GoalVisibility;

  @Prop({ required: true, enum: GoalStatus, default: GoalStatus.DRAFT })
  status: GoalStatus;

  @Prop({ type: [String], required: true, default: [] })
  successCriteria: string[];

  @Prop({ default: null })
  baseline: string | null;

  @Prop({ default: null })
  targetDate: Date | null;

  @Prop({ default: null })
  agreementId: string | null;

  @Prop({ type: [String], default: [] })
  evidenceRefs: string[];

  @Prop({ required: true, default: 1 })
  version: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipGoalSchema =
  SchemaFactory.createForClass(MentorshipGoal);
MentorshipGoalSchema.index({ engagementId: 1, ownerId: 1 });
