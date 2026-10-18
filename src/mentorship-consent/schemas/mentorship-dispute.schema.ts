import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MentorshipDisputeDocument = HydratedDocument<MentorshipDispute>;

export enum DisputeStatus {
  OPEN = 'open',
  RESPONDED = 'responded',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum DisputeType {
  ATTENDANCE = 'attendance',
  COMPLETION = 'completion',
  DURATION = 'duration',
  OUTCOME = 'outcome',
}

@Schema({ timestamps: true, collection: 'mentorship_disputes' })
export class MentorshipDispute {
  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true })
  complainantId: string;

  @Prop({ required: true, enum: DisputeType })
  type: DisputeType;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: [String], default: [] })
  evidenceRefs: string[];

  @Prop({ required: true, enum: DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @Prop({ default: null })
  respondentId: string | null;

  @Prop({ default: null })
  response: string | null;

  @Prop({ default: null })
  resolvedBy: string | null;

  @Prop({ default: null })
  resolvedAt: Date | null;

  @Prop({ required: true })
  dueAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipDisputeSchema =
  SchemaFactory.createForClass(MentorshipDispute);
MentorshipDisputeSchema.index({ sessionId: 1, status: 1 });
