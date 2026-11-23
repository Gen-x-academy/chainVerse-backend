import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MatchingFeedbackDocument = HydratedDocument<MatchingFeedback>;

export enum FeedbackKind {
  RECOMMENDATION_RELEVANCE = 'recommendation_relevance',
  DECLINED_PROPOSAL = 'declined_proposal',
  MATCH_QUALITY = 'match_quality',
}

export enum FeedbackSubjectType {
  RECOMMENDATION = 'recommendation',
  PROPOSAL = 'proposal',
  MATCH = 'match',
}

/** Explicit retention choices; the expiry date is derived, never client-set. */
export enum FeedbackRetentionPolicy {
  ANONYMIZED_90D = 'anonymized_90d',
  ANONYMIZED_365D = 'anonymized_365d',
}

export const FEEDBACK_RETENTION_DAYS: Record<FeedbackRetentionPolicy, number> = {
  [FeedbackRetentionPolicy.ANONYMIZED_90D]: 90,
  [FeedbackRetentionPolicy.ANONYMIZED_365D]: 365,
};

/**
 * Immutable, consent-gated feedback row.
 *
 * Nothing in this collection writes to agreements, proposals or terms. Free
 * text is only ever returned by the dedicated detail endpoint to the author
 * or an auditing admin, and only until the retention deadline.
 */
@Schema({ timestamps: true, collection: 'mentorship_feedback' })
export class MatchingFeedback {
  @Prop({ required: true, index: true })
  actorId!: string;

  @Prop({ required: true, index: true })
  subjectId!: string;

  @Prop({ required: true, enum: FeedbackSubjectType })
  subjectType!: FeedbackSubjectType;

  @Prop({ required: true, enum: FeedbackKind, index: true })
  kind!: FeedbackKind;

  @Prop({ required: true, min: 1, max: 5 })
  rating!: number;

  @Prop({ type: String, default: null })
  freeText!: string | null;

  @Prop({ type: String, default: null })
  freeTextHash!: string | null;

  @Prop({ required: true, default: false })
  consentGiven!: boolean;

  @Prop({ required: true, enum: FeedbackRetentionPolicy })
  retentionPolicy!: FeedbackRetentionPolicy;

  @Prop({ required: true, type: Date })
  retentionExpiresAt!: Date;

  @Prop({ required: true })
  idempotencyKeyHash!: string;

  @Prop({ required: true, default: false })
  anonymized!: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MatchingFeedbackSchema =
  SchemaFactory.createForClass(MatchingFeedback);

MatchingFeedbackSchema.index({ actorId: 1, idempotencyKeyHash: 1 }, { unique: true });
MatchingFeedbackSchema.index({
  kind: 1,
  consentGiven: 1,
  retentionExpiresAt: 1,
});
