import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MentorshipActionItemDocument =
  HydratedDocument<MentorshipActionItem>;

export enum ActionItemStatus {
  OPEN = 'open',
  ACKNOWLEDGED = 'acknowledged',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled',
}

export enum ActionItemPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Schema({ timestamps: true, collection: 'mentorship_action_items' })
export class MentorshipActionItem {
  @Prop({ required: true, index: true })
  engagementId: string;

  @Prop({ required: true, index: true })
  assigneeId: string;

  @Prop({ required: true })
  assignerId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: null })
  description: string | null;

  @Prop({ default: null })
  dueDate: Date | null;

  @Prop({
    required: true,
    enum: ActionItemStatus,
    default: ActionItemStatus.OPEN,
  })
  status: ActionItemStatus;

  @Prop({
    required: true,
    enum: ActionItemPriority,
    default: ActionItemPriority.MEDIUM,
  })
  priority: ActionItemPriority;

  @Prop({ default: null })
  sourceSessionId: string | null;

  @Prop({ type: [Date], default: [] })
  reminders: Date[];

  @Prop({ type: [String], default: [] })
  completionEvidence: string[];

  @Prop({ default: null })
  acknowledgedAt: Date | null;

  @Prop({ default: null })
  completedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipActionItemSchema =
  SchemaFactory.createForClass(MentorshipActionItem);
MentorshipActionItemSchema.index({ engagementId: 1, assigneeId: 1, status: 1 });
MentorshipActionItemSchema.index({ dueDate: 1 });
