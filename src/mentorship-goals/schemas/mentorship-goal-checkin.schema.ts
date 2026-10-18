import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MentorshipGoalCheckinDocument =
  HydratedDocument<MentorshipGoalCheckin>;

@Schema({ timestamps: true, collection: 'mentorship_goal_checkins' })
export class MentorshipGoalCheckin {
  @Prop({ required: true, index: true })
  goalId: string;

  @Prop({ required: true, index: true })
  engagementId: string;

  @Prop({ required: true })
  authorId: string;

  /** 1-based position for this goal. */
  @Prop({ required: true })
  sequence: number;

  @Prop({ default: null })
  status: string | null;

  @Prop({ minimum: 0, maximum: 10 })
  confidence?: number;

  @Prop({ default: null })
  blockers: string | null;

  @Prop({ default: null })
  notes: string | null;

  @Prop({ type: [String], default: [] })
  evidenceRefs: string[];

  @Prop({ default: null })
  nextAction: string | null;

  @Prop({ required: true })
  occurredAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipGoalCheckinSchema = SchemaFactory.createForClass(
  MentorshipGoalCheckin,
);
MentorshipGoalCheckinSchema.index({ goalId: 1, sequence: 1 }, { unique: true });
MentorshipGoalCheckinSchema.index({ engagementId: 1, occurredAt: -1 });
