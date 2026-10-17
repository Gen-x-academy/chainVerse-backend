import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { CheckOutcome } from '../domain/eligibility-rule.types';

export type EligibilityEvaluationDocument = HydratedDocument<EligibilityEvaluation>;

/** Retention for preflight records (they are diagnostics, not decisions). */
export const PREFLIGHT_RETENTION_DAYS = 30;

/**
 * Record of an eligibility evaluation (preflight or submission) and the
 * rule-set / form versions it used.
 *
 * Idempotency: one row per (applicant, program, ruleSetVersion, formVersion,
 * inputHash, kind) – a retried preflight with the same input updates
 * `lastEvaluatedAt`/`count` instead of inserting a new row.
 *
 * Privacy: stores a hash of the answers, never the answers themselves.
 */
@Schema({ collection: 'mentorship_eligibility_evaluations', timestamps: true })
export class EligibilityEvaluation {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  programId: string;

  @Prop({ required: true, index: true })
  applicantId: string;

  @Prop({ required: true, enum: ['preflight', 'submission'] })
  kind: 'preflight' | 'submission';

  @Prop({ required: true })
  ruleSetVersion: number;

  @Prop({ type: Number, default: null })
  formVersion: number | null;

  @Prop({ required: true })
  inputHash: string;

  @Prop({ required: true, enum: ['pass', 'fail', 'needs_information'] })
  outcome: CheckOutcome;

  /** Rule ids and outcomes only – enough to debug, nothing sensitive. */
  @Prop({ type: [Object], default: [] })
  checks: Array<{ ruleId: string; outcome: CheckOutcome }>;

  @Prop({ required: true, default: 1 })
  count: number;

  @Prop({ required: true, type: Date })
  lastEvaluatedAt: Date;

  @Prop({ required: true, type: Date })
  expiresAt: Date;
}

export const EligibilityEvaluationSchema = SchemaFactory.createForClass(EligibilityEvaluation);

EligibilityEvaluationSchema.index(
  { applicantId: 1, programId: 1, kind: 1, ruleSetVersion: 1, formVersion: 1, inputHash: 1 },
  { unique: true },
);
EligibilityEvaluationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
