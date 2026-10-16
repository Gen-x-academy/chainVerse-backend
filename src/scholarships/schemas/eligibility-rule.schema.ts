import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EligibilityRuleDocument = HydratedDocument<EligibilityRule>;

/**
 * Discriminator values that identify what kind of eligibility requirement
 * this rule enforces.  Each type drives a different parameter shape stored
 * in `parameters`.
 *
 * Rule types and their expected parameter keys:
 *
 *   ENROLLMENT_STATUS     – { status: 'full_time' | 'part_time' | 'any' }
 *   COURSE_COMPLETION     – { courseId: string; minScore?: number }
 *   MIN_GPA               – { minGpa: number }
 *   GEOGRAPHY             – { countries: string[]; regions?: string[] }
 *   INCOME_BAND           – { maxAnnualIncomeUsd: number }
 *   PLATFORM_ROLE         – { roles: string[] }
 *   MIN_AGE               – { minAge: number }
 *   MAX_AGE               – { maxAge: number }
 *   CUSTOM_ATTESTATION    – { attestationType: string; required: true }
 *
 * Sensitive evidence minimization:
 *   - INCOME_BAND stores only the threshold, never raw income figures.
 *   - GEOGRAPHY stores only country/region codes, not addresses.
 *   - The full attestation payload is never duplicated here; only the type
 *     reference is stored.
 */
export enum EligibilityRuleType {
  ENROLLMENT_STATUS = 'enrollment_status',
  COURSE_COMPLETION = 'course_completion',
  MIN_GPA = 'min_gpa',
  GEOGRAPHY = 'geography',
  INCOME_BAND = 'income_band',
  PLATFORM_ROLE = 'platform_role',
  MIN_AGE = 'min_age',
  MAX_AGE = 'max_age',
  CUSTOM_ATTESTATION = 'custom_attestation',
}

/** Logical combinator for multi-rule evaluation. */
export enum RuleOperator {
  AND = 'and',
  OR = 'or',
}

/**
 * A single composable eligibility requirement for a scholarship program.
 *
 * Rules are evaluated deterministically: same inputs always produce the
 * same pass/fail result.  Sensitive evidence (income, location) is
 * minimized to threshold values only.
 *
 * Privacy:
 *   - `parameters` must not contain raw PII; only thresholds and codes.
 *   - OWNER / ADMIN may manage rules; org members may read them.
 *
 * Migration:
 *   - New collection `scholarship_eligibility_rules`.  No existing data affected.
 */
@Schema({ timestamps: true, collection: 'scholarship_eligibility_rules' })
export class EligibilityRule {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ScholarshipProgram', index: true })
  programId: Types.ObjectId;

  @Prop({ required: true, enum: EligibilityRuleType })
  ruleType: EligibilityRuleType;

  /**
   * Logical operator for this rule relative to its siblings.
   * The rule set passes when ALL AND rules pass, OR at least one OR rule passes.
   */
  @Prop({ required: true, enum: RuleOperator, default: RuleOperator.AND })
  operator: RuleOperator;

  /** Type-specific threshold / configuration values (privacy-minimized). */
  @Prop({ type: Object, required: true })
  parameters: Record<string, unknown>;

  /**
   * Whether failing this rule hard-blocks the application.
   * When false the rule is advisory (surfaced as a warning only).
   */
  @Prop({ required: true, default: true })
  isRequired: boolean;

  /** Human-readable message returned when the applicant fails this rule. */
  @Prop({ trim: true, maxlength: 500 })
  errorMessage?: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop()
  updatedBy?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EligibilityRuleSchema =
  SchemaFactory.createForClass(EligibilityRule);

// One rule per (program, ruleType) to prevent contradictory duplicates
EligibilityRuleSchema.index(
  { programId: 1, ruleType: 1 },
  { unique: true },
);
EligibilityRuleSchema.index({ organizationId: 1, programId: 1 });
