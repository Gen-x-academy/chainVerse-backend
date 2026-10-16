import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProgramExclusionDocument = HydratedDocument<ProgramExclusion>;

/**
 * Categories of exclusion rules.
 *
 *   CONCURRENT_SCHOLARSHIP – applicant may not hold another active scholarship
 *   PRIOR_AWARD            – applicant must not have won this program before
 *   EMPLOYMENT_STATUS      – employed applicants are excluded
 *   PRIOR_REJECTION        – applicant was rejected from this program N times
 */
export enum ExclusionType {
  CONCURRENT_SCHOLARSHIP = 'concurrent_scholarship',
  PRIOR_AWARD = 'prior_award',
  EMPLOYMENT_STATUS = 'employment_status',
  PRIOR_REJECTION = 'prior_rejection',
}

/**
 * Stable, machine-readable reason codes used in exclusion decisions.
 *
 * These codes are intentionally stable across schema versions so that
 * downstream systems (notifications, analytics) can rely on them without
 * re-parsing human-readable messages.
 */
export enum ExclusionReasonCode {
  ALREADY_AWARDED = 'already_awarded',
  CONCURRENT_NOT_ALLOWED = 'concurrent_not_allowed',
  INELIGIBLE_EMPLOYMENT_STATUS = 'ineligible_employment_status',
  PRIOR_REJECTION_LIMIT = 'prior_rejection_limit',
}

/**
 * An exclusion rule that disqualifies applicants matching certain conditions.
 *
 * Decisions produced using these rules are reproducible: same applicant data
 * + same rules always yields the same exclusion determination.
 *
 * Privacy:
 *   - `parameters` stores only thresholds and codes, never raw applicant data.
 *
 * Migration:
 *   - New collection `scholarship_program_exclusions`. No existing data affected.
 */
@Schema({ timestamps: true, collection: 'scholarship_program_exclusions' })
export class ProgramExclusion {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ScholarshipProgram', index: true })
  programId: Types.ObjectId;

  @Prop({ required: true, enum: ExclusionType })
  exclusionType: ExclusionType;

  /**
   * Stable reason code used in all exclusion decisions based on this rule.
   * Clients must not hard-code the human-readable description field.
   */
  @Prop({ required: true, enum: ExclusionReasonCode })
  reasonCode: ExclusionReasonCode;

  /**
   * Type-specific parameters (e.g. `{ maxPriorRejections: 2 }`).
   * Must not contain raw applicant PII.
   */
  @Prop({ type: Object, default: {} })
  parameters: Record<string, unknown>;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProgramExclusionSchema =
  SchemaFactory.createForClass(ProgramExclusion);

// One rule per (program, exclusionType) — prevents contradictory duplicates
ProgramExclusionSchema.index(
  { programId: 1, exclusionType: 1 },
  { unique: true },
);
ProgramExclusionSchema.index({ organizationId: 1, programId: 1 });
