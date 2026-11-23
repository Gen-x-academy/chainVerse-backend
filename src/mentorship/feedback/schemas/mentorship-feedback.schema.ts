import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum FeedbackRole {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

@Schema({ timestamps: true, collection: 'mentorship_session_feedback' })
export class MentorshipSessionFeedback {
  @Prop({ required: true, index: true })
  sessionId!: string;

  @Prop({ required: true, index: true })
  reviewerId!: string;

  @Prop({ required: true, enum: FeedbackRole })
  role!: FeedbackRole;

  @Prop({ required: true, min: 1, max: 5 })
  rating!: number;

  @Prop({ type: [String], default: [] })
  strengths!: string[];

  @Prop({ default: '' })
  comment!: string;

  @Prop({ default: false })
  protectedComment!: boolean;

  @Prop({ type: Date, default: null })
  revealAt!: Date | null;

  @Prop({ required: true, default: true })
  consentToAggregate!: boolean;
}

export type MentorshipSessionFeedbackDocument =
  HydratedDocument<MentorshipSessionFeedback>;
export const MentorshipSessionFeedbackSchema = SchemaFactory.createForClass(
  MentorshipSessionFeedback,
);
MentorshipSessionFeedbackSchema.index(
  { sessionId: 1, role: 1 },
  { unique: true },
);
