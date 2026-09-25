import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MilestoneProgressStatus } from '../scholarship.constants';

export type MilestoneProgressDocument = HydratedDocument<MilestoneProgress>;

/**
 * Mutable state of one award milestone, keyed by `(awardId, milestoneKey)`.
 *
 * Kept apart from the (immutable) schedule so progress survives amendments,
 * and so every transition can be a single conditional update — that
 * compare-and-set is what makes decisions and payment eligibility race-safe.
 */
@Schema({ timestamps: true, collection: 'scholarship_milestone_progress' })
export class MilestoneProgress {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  awardId: string;

  @Prop({ required: true })
  milestoneKey: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(MilestoneProgressStatus),
    default: MilestoneProgressStatus.PENDING,
  })
  status: MilestoneProgressStatus;

  @Prop({ type: String, default: null })
  latestEvidenceId: string | null;

  @Prop({ type: Number, default: 0 })
  latestEvidenceVersion: number;

  /** Decision that moved the milestone out of `evidence_submitted`. */
  @Prop({ type: String, default: null })
  lastDecisionId: string | null;

  @Prop({ type: Date, default: null })
  decidedAt: Date | null;
}

export const MilestoneProgressSchema =
  SchemaFactory.createForClass(MilestoneProgress);

MilestoneProgressSchema.index(
  { awardId: 1, milestoneKey: 1 },
  { unique: true },
);
