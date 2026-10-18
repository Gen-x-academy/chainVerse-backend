import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MentorshipTimelineEventDocument =
  HydratedDocument<MentorshipTimelineEvent>;

/** What a timeline entry describes. */
export enum TimelineEventType {
  GOAL = 'goal',
  SESSION = 'session',
  MILESTONE = 'milestone',
  DELIVERABLE = 'deliverable',
  DECISION = 'decision',
  AGREEMENT_CHANGE = 'agreement_change',
}

/** Who may see an entry. Private entries are omitted for outsiders, never redacted. */
export enum TimelineVisibility {
  ENGAGEMENT = 'engagement',
  PRIVATE = 'private',
}

/**
 * One immutable entry in an engagement's progress timeline. `sequence` is a
 * per-engagement monotonic counter, giving a stable total order that pagination
 * cursors can walk without gaps even while new events are appended.
 */
@Schema({ timestamps: true, collection: 'mentorship_timeline_events' })
export class MentorshipTimelineEvent {
  @Prop({ required: true, index: true })
  engagementId: string;

  /** 1-based position within the engagement; unique, assigned on append. */
  @Prop({ required: true })
  sequence: number;

  @Prop({ required: true, enum: TimelineEventType })
  type: TimelineEventType;

  /** Id of the record this entry links to (goal, session, milestone, ...). */
  @Prop({ required: true })
  subjectId: string;

  @Prop({ required: true })
  actorId: string;

  @Prop({ default: null })
  summary: string | null;

  @Prop({
    required: true,
    enum: TimelineVisibility,
    default: TimelineVisibility.ENGAGEMENT,
  })
  visibility: TimelineVisibility;

  /** For PRIVATE entries: the only users besides the actor who may see them. */
  @Prop({ type: [String], default: [] })
  allowedUserIds: string[];

  @Prop({ required: true })
  occurredAt: Date;
}

export const MentorshipTimelineEventSchema = SchemaFactory.createForClass(
  MentorshipTimelineEvent,
);
MentorshipTimelineEventSchema.index(
  { engagementId: 1, sequence: 1 },
  { unique: true },
);
