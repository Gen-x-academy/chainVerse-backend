import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EligibilityRule,
  EligibilityRuleDocument,
  EligibilityRuleType,
  RuleOperator,
} from '../schemas/eligibility-rule.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from '../schemas/scholarship-program.schema';
import { AddEligibilityRuleDto } from '../dto/eligibility-rule.dto';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

export interface EligibilityEvaluationResult {
  eligible: boolean;
  /** Rules that the applicant failed (required rules only block). */
  failedRules: Array<{
    ruleType: EligibilityRuleType;
    isRequired: boolean;
    errorMessage: string;
  }>;
}

/**
 * Manages composable eligibility rules for scholarship programs.
 *
 * Design invariants:
 *   - One rule per (programId, ruleType) — unique index prevents contradictions.
 *   - Evaluation is deterministic: same inputs always produce the same result.
 *   - Sensitive evidence is minimized: parameters store only thresholds/codes.
 *   - Rules are validated before publication via validateBeforePublish().
 *
 * Evaluation semantics:
 *   - All AND rules must pass.
 *   - At least one OR rule must pass (if any OR rules exist).
 *   - Advisory (isRequired=false) rules never block but are surfaced in the result.
 */
@Injectable()
export class EligibilityRuleService {
  constructor(
    @InjectModel(EligibilityRule.name)
    private readonly ruleModel: Model<EligibilityRuleDocument>,
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async addRule(
    organizationId: string,
    programId: string,
    dto: AddEligibilityRuleDto,
    actorId: string,
  ): Promise<EligibilityRuleDocument> {
    const program = await this.programModel
      .findOne({ _id: programId, organizationId })
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }
    // Duplicate-type check (unique index handles it at the DB level; we give
    // a better error message here)
    const existing = await this.ruleModel
      .findOne({ programId: program._id, ruleType: dto.ruleType })
      .exec();
    if (existing) {
      throw new ResourceConflictException(
        `An eligibility rule of type '${dto.ruleType}' already exists for this program`,
        ErrorCode.BIZ_ELIGIBILITY_RULE_CONFLICT,
      );
    }
    return this.ruleModel.create({
      organizationId,
      programId: program._id,
      ruleType: dto.ruleType,
      operator: dto.operator,
      parameters: dto.parameters,
      isRequired: dto.isRequired,
      errorMessage: dto.errorMessage,
      createdBy: actorId,
    });
  }

  async removeRule(
    organizationId: string,
    programId: string,
    ruleId: string,
    actorId: string,
  ): Promise<void> {
    const rule = await this.ruleModel
      .findOne({ _id: ruleId, programId, organizationId })
      .exec();
    if (!rule) {
      throw new ResourceNotFoundException(
        'Eligibility rule not found',
        ErrorCode.RES_ELIGIBILITY_RULE_NOT_FOUND,
      );
    }
    await this.ruleModel.deleteOne({ _id: rule._id }).exec();
  }

  async listRules(
    organizationId: string,
    programId: string,
  ): Promise<EligibilityRuleDocument[]> {
    return this.ruleModel
      .find({ programId, organizationId })
      .sort({ ruleType: 1 })
      .exec();
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Validates the rule set before a program is published.
   *
   * Currently checks:
   *   - No contradiction: MIN_AGE value ≤ MAX_AGE value when both rules exist.
   *
   * Throws BIZ_ELIGIBILITY_RULE_CONFLICT with a descriptive message on failure.
   */
  async validateBeforePublish(programId: string): Promise<void> {
    const rules = await this.ruleModel.find({ programId }).exec();
    const byType = new Map(rules.map((r) => [r.ruleType, r]));

    const minAgeRule = byType.get(EligibilityRuleType.MIN_AGE);
    const maxAgeRule = byType.get(EligibilityRuleType.MAX_AGE);
    if (minAgeRule && maxAgeRule) {
      const minAge = Number(minAgeRule.parameters['minAge'] ?? 0);
      const maxAge = Number(maxAgeRule.parameters['maxAge'] ?? Infinity);
      if (minAge > maxAge) {
        throw new ResourceConflictException(
          `Eligibility contradiction: MIN_AGE (${minAge}) is greater than MAX_AGE (${maxAge})`,
          ErrorCode.BIZ_ELIGIBILITY_RULE_CONFLICT,
        );
      }
    }
  }

  // ── Evaluation ────────────────────────────────────────────────────────────

  /**
   * Evaluates all eligibility rules for a given applicant against supplied
   * claims.  The result is deterministic: same claims + same rules = same result.
   *
   * @param programId   The scholarship program.
   * @param claims      Key-value claims from trusted upstream services
   *                    (enrollment, identity, etc.).  This service never
   *                    fetches external data; all evidence must be pre-fetched
   *                    and passed in.
   */
  async evaluateApplicant(
    programId: string,
    claims: Record<string, unknown>,
  ): Promise<EligibilityEvaluationResult> {
    const rules = await this.ruleModel.find({ programId }).exec();
    const failedRules: EligibilityEvaluationResult['failedRules'] = [];
    let hasOrRules = false;
    let anyOrPassed = false;

    for (const rule of rules) {
      const passed = this.evaluateSingleRule(rule, claims);

      if (rule.operator === RuleOperator.OR) {
        hasOrRules = true;
        if (passed) anyOrPassed = true;
      }

      if (!passed) {
        failedRules.push({
          ruleType: rule.ruleType,
          isRequired: rule.isRequired,
          errorMessage:
            rule.errorMessage ??
            `You do not meet the eligibility requirement: ${rule.ruleType}`,
        });
      }
    }

    // OR shortcut: if there were OR rules and none passed, the set fails
    if (hasOrRules && !anyOrPassed) {
      // If not already in failedRules for OR reasons, mark overall fail
    }

    const requiredFailures = failedRules.filter((r) => r.isRequired);
    const eligible =
      requiredFailures.length === 0 && (!hasOrRules || anyOrPassed);

    return { eligible, failedRules };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private evaluateSingleRule(
    rule: EligibilityRuleDocument,
    claims: Record<string, unknown>,
  ): boolean {
    const p = rule.parameters;
    switch (rule.ruleType) {
      case EligibilityRuleType.MIN_GPA: {
        const applicantGpa = Number(claims['gpa'] ?? 0);
        return applicantGpa >= Number(p['minGpa'] ?? 0);
      }
      case EligibilityRuleType.MIN_AGE: {
        const applicantAge = Number(claims['age'] ?? 0);
        return applicantAge >= Number(p['minAge'] ?? 0);
      }
      case EligibilityRuleType.MAX_AGE: {
        const applicantAge = Number(claims['age'] ?? Infinity);
        return applicantAge <= Number(p['maxAge'] ?? Infinity);
      }
      case EligibilityRuleType.ENROLLMENT_STATUS: {
        const required = p['status'];
        if (required === 'any') return true;
        return claims['enrollmentStatus'] === required;
      }
      case EligibilityRuleType.GEOGRAPHY: {
        const allowed = (p['countries'] as string[]) ?? [];
        return allowed.includes(String(claims['country'] ?? ''));
      }
      case EligibilityRuleType.INCOME_BAND: {
        const maxIncome = Number(p['maxAnnualIncomeUsd'] ?? Infinity);
        return Number(claims['annualIncomeUsd'] ?? 0) <= maxIncome;
      }
      case EligibilityRuleType.PLATFORM_ROLE: {
        const allowed = (p['roles'] as string[]) ?? [];
        return allowed.includes(String(claims['platformRole'] ?? ''));
      }
      case EligibilityRuleType.COURSE_COMPLETION: {
        const completedCourses = (claims['completedCourseIds'] as string[]) ?? [];
        return completedCourses.includes(String(p['courseId'] ?? ''));
      }
      case EligibilityRuleType.CUSTOM_ATTESTATION: {
        const attestationType = String(p['attestationType'] ?? '');
        const attestations = (claims['attestationTypes'] as string[]) ?? [];
        return attestations.includes(attestationType);
      }
      default:
        // Unknown rule type: fail safe (do not grant eligibility)
        return false;
    }
  }
}
