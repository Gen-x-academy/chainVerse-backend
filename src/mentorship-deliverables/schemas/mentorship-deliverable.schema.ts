import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MentorshipDeliverableDocument =
  HydratedDocument<MentorshipDeliverable>;

/** What a submission points at. Only references are stored, never raw media. */
export enum DeliverableKind {
  FILE = 'file',
  LINK = 'link',
  COMMIT = 'commit',
  TEXT = 'text',
}

export enum DeliverableStatus {
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  CHANGES_REQUESTED = 'changes_requested',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export enum DeliverableDecision {
  ACCEPT = 'accept',
  REQUEST_CHANGES = 'request_changes',
  REJECT = 'reject',
}

/** Per-kind size policy (bytes for FILE, character budget for TEXT). */
export const DELIVERABLE_SIZE_LIMITS: Record<DeliverableKind, number> = {
  [DeliverableKind.FILE]: 25 * 1024 * 1024,
  [DeliverableKind.LINK]: 2048,
  [DeliverableKind.COMMIT]: 256,
  [DeliverableKind.TEXT]: 20_000,
};

/**
 * One immutable version of a deliverable submitted against a milestone.
 * A resubmission creates a new version; existing versions are never mutated.
 */
@Schema({ timestamps: true, collection: 'mentorship_deliverables' })
export class MentorshipDeliverable {
  @Prop({ required: true, index: true })
  engagementId: string;

  @Prop({ required: true, index: true })
  milestoneId: string;

  @Prop({ required: true })
  submitterId: string;

  /** 1-based version within (engagementId, milestoneId); immutable once set. */
  @Prop({ required: true })
  version: number;

  @Prop({ required: true, enum: DeliverableKind })
  kind: DeliverableKind;

  /** Provider reference (URL, repo commit sha, storage key) — never raw media. */
  @Prop({ required: true })
  reference: string;

  @Prop({ default: null })
  declaration: string | null;

  @Prop({ required: true, default: 0 })
  sizeBytes: number;

  /** Optional integrity hash supplied by the submitter. */
  @Prop({ default: null })
  integrityHash: string | null;

  @Prop({
    required: true,
    enum: DeliverableStatus,
    default: DeliverableStatus.SUBMITTED,
  })
  status: DeliverableStatus;

  /** Reviewers explicitly authorised for this deliverable; deny-by-default. */
  @Prop({ type: [String], default: [] })
  reviewerIds: string[];

  /** True when submitted after the milestone due date. */
  @Prop({ required: true, default: false })
  late: boolean;

  /** Private content access expiry; content is never served publicly. */
  @Prop({ default: null })
  accessExpiresAt: Date | null;

  @Prop({ default: null })
  decidedAt: Date | null;

  @Prop({ default: null })
  decidedBy: string | null;

  /** Guards the single downstream acceptance side effect. */
  @Prop({ required: true, default: false })
  acceptanceDispatched: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipDeliverableSchema = SchemaFactory.createForClass(
  MentorshipDeliverable,
);
MentorshipDeliverableSchema.index(
  { engagementId: 1, milestoneId: 1, version: 1 },
  { unique: true },
);

/** Append-only review decision; one row per decision, replay-safe by unique key. */
@Schema({ timestamps: true, collection: 'mentorship_deliverable_reviews' })
export class MentorshipDeliverableReview {
  @Prop({ required: true, index: true })
  deliverableId: string;

  @Prop({ required: true })
  reviewerId: string;

  @Prop({ required: true, enum: DeliverableDecision })
  decision: DeliverableDecision;

  @Prop({ default: null })
  reason: string | null;

  @Prop({ type: [String], default: [] })
  rubricScores: string[];

  @Prop({ type: [String], default: [] })
  comments: string[];

  createdAt?: Date;
  updatedAt?: Date;
}

export type MentorshipDeliverableReviewDocument =
  HydratedDocument<MentorshipDeliverableReview>;
export const MentorshipDeliverableReviewSchema = SchemaFactory.createForClass(
  MentorshipDeliverableReview,
);
MentorshipDeliverableReviewSchema.index(
  { deliverableId: 1, reviewerId: 1, decision: 1 },
  { unique: true },
);
