import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { AnswerValue } from '../../forms/domain/question.types';
import { CheckOutcome } from '../../eligibility/domain/eligibility-rule.types';

export type MentorshipApplicationDocument = HydratedDocument<MentorshipApplication>;

export const APPLICATION_STATUSES = ['submitted', 'in_review', 'decided', 'withdrawn'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const OPEN_STATUSES: ApplicationStatus[] = ['submitted', 'in_review'];

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];
/** Numeric rank stored alongside the label so queues sort by urgency. */
export const PRIORITY_RANK: Record<Priority, number> = { low: 0, normal: 1, high: 2, urgent: 3 };

export const DECISION_OUTCOMES = ['accepted', 'rejected', 'waitlisted'] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export class ReviewDecision {
  outcome: DecisionOutcome;
  /** Internal note for the program team – never shown to the applicant. */
  note: string | null;
  decidedBy: string;
  decidedAt: Date;
}

export class ReviewState {
  assigneeId: string | null;
  assignedAt: Date | null;
  assignedBy: string | null;
  priority: Priority;
  priorityRank: number;
  dueAt: Date;
  overdueNotifiedAt: Date | null;
  /** Reviewers who declared *no* conflict of interest for this application. */
  clearedReviewerIds: string[];
  /** Reviewers who declared a conflict – they cannot be assigned or decide. */
  conflictedReviewerIds: string[];
  decision: ReviewDecision | null;
}

/**
 * A submitted mentorship application.
 *
 * - `formVersion` pins the immutable form snapshot used to render answers.
 * - `eligibility` records the rule-set version enforced at submission.
 * - `version` is an optimistic-concurrency counter bumped by every review
 *   queue mutation (assign, triage, conflict, decide).
 */
@Schema({ collection: 'mentorship_applications', timestamps: true })
export class MentorshipApplication {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  programId: string;

  @Prop({ required: true, index: true })
  applicantId: string;

  @Prop({ required: true, enum: APPLICATION_STATUSES, default: 'submitted' })
  status: ApplicationStatus;

  @Prop({ required: true })
  formVersion: number;

  @Prop({ type: Object, required: true })
  answers: Record<string, AnswerValue>;

  @Prop({ required: true })
  answersHash: string;

  @Prop({ type: Object, required: true })
  eligibility: {
    ruleSetVersion: number;
    outcome: CheckOutcome;
    evaluatedAt: Date;
  };

  @Prop({ required: true, type: Date })
  submittedAt: Date;

  @Prop({ type: Object, required: true })
  review: ReviewState;

  @Prop({ required: true, default: 0 })
  version: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipApplicationSchema = SchemaFactory.createForClass(MentorshipApplication);

// One application per applicant per program; also the idempotency anchor for submit retries.
MentorshipApplicationSchema.index({ programId: 1, applicantId: 1 }, { unique: true });

// Queue indexes – one per supported stable sort (always ending in _id).
MentorshipApplicationSchema.index({ programId: 1, status: 1, 'review.priorityRank': -1, 'review.dueAt': 1, _id: 1 });
MentorshipApplicationSchema.index({ programId: 1, status: 1, 'review.dueAt': 1, _id: 1 });
MentorshipApplicationSchema.index({ programId: 1, status: 1, submittedAt: 1, _id: 1 });
MentorshipApplicationSchema.index({ 'review.assigneeId': 1, status: 1 });
// Overdue sweeper.
MentorshipApplicationSchema.index({ status: 1, 'review.overdueNotifiedAt': 1, 'review.dueAt': 1 });
