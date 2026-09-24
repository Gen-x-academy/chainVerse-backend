import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ProgramPrerequisite,
  ProgramPrerequisiteDocument,
  PrerequisiteType,
} from '../schemas/program-prerequisite.schema';
import {
  ProgramExclusion,
  ProgramExclusionDocument,
  ExclusionType,
  ExclusionReasonCode,
} from '../schemas/program-exclusion.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from '../schemas/scholarship-program.schema';
import {
  AddPrerequisiteDto,
  AddExclusionDto,
  ExclusionDecision,
  PrerequisiteEvaluationResult,
} from '../dto/prerequisite-exclusion.dto';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

/**
 * Manages prerequisite and exclusion rules for scholarship programs.
 *
 * Key design invariants:
 *   - Unique index (programId, prerequisiteType, referenceId) prevents
 *     contradictory duplicates at the schema level.
 *   - Unique index (programId, exclusionType) prevents duplicate exclusion types.
 *   - Evaluation is deterministic: same applicant claims + same rules = same result.
 *   - Exclusions always use stable ExclusionReasonCode values so downstream
 *     systems can rely on them without parsing description strings.
 *   - validateBeforePublish() detects self-referential prerequisite cycles
 *     (a program requiring itself as a prerequisite).
 *
 * Privacy:
 *   - `referenceId` is an opaque external ID; no applicant PII is stored.
 *   - `parameters` stores only thresholds, never raw applicant data.
 */
@Injectable()
export class PrerequisiteExclusionService {
  constructor(
    @InjectModel(ProgramPrerequisite.name)
    private readonly prerequisiteModel: Model<ProgramPrerequisiteDocument>,
    @InjectModel(ProgramExclusion.name)
    private readonly exclusionModel: Model<ProgramExclusionDocument>,
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
  ) {}

  // ── Prerequisites ─────────────────────────────────────────────────────────

  async addPrerequisite(
    organizationId: string,
    programId: string,
    dto: AddPrerequisiteDto,
    actorId: string,
  ): Promise<ProgramPrerequisiteDocument> {
    const program = await this.getProgram(organizationId, programId);

    const existing = await this.prerequisiteModel
      .findOne({
        programId: program._id,
        prerequisiteType: dto.prerequisiteType,
        referenceId: dto.referenceId,
      })
      .exec();
    if (existing) {
      throw new ResourceConflictException(
        `A prerequisite of type '${dto.prerequisiteType}' with referenceId '${dto.referenceId}' already exists`,
        ErrorCode.BIZ_PREREQUISITE_DUPLICATE,
      );
    }

    return this.prerequisiteModel.create({
      organizationId,
      programId: program._id,
      prerequisiteType: dto.prerequisiteType,
      referenceId: dto.referenceId,
      description: dto.description,
      isRequired: dto.isRequired,
      createdBy: actorId,
    });
  }

  async removePrerequisite(
    organizationId: string,
    programId: string,
    prerequisiteId: string,
    _actorId: string,
  ): Promise<void> {
    const rule = await this.prerequisiteModel
      .findOne({ _id: prerequisiteId, programId, organizationId })
      .exec();
    if (!rule) {
      throw new ResourceNotFoundException(
        'Prerequisite rule not found',
        ErrorCode.RES_PROGRAM_PREREQUISITE_NOT_FOUND,
      );
    }
    await this.prerequisiteModel.deleteOne({ _id: rule._id }).exec();
  }

  async listPrerequisites(
    organizationId: string,
    programId: string,
  ): Promise<ProgramPrerequisiteDocument[]> {
    return this.prerequisiteModel
      .find({ programId, organizationId })
      .sort({ prerequisiteType: 1 })
      .exec();
  }

  /**
   * Evaluates whether an applicant meets all prerequisites for a program.
   * Deterministic: same `fulfilledReferenceIds` + same rules = same result.
   *
   * @param programId             The program to evaluate.
   * @param fulfilledReferenceIds Set of referenceIds the applicant has satisfied
   *                              (achievements, completed courses, prior awards, etc.).
   */
  async evaluatePrerequisites(
    programId: string,
    fulfilledReferenceIds: string[],
  ): Promise<PrerequisiteEvaluationResult> {
    const rules = await this.prerequisiteModel
      .find({ programId })
      .exec();

    const fulfilled = new Set(fulfilledReferenceIds);
    const unmet: PrerequisiteEvaluationResult['unmet'] = [];

    for (const rule of rules) {
      if (!fulfilled.has(rule.referenceId)) {
        unmet.push({
          prerequisiteType: rule.prerequisiteType,
          referenceId: rule.referenceId,
          isRequired: rule.isRequired,
          description: rule.description ?? `Must satisfy ${rule.prerequisiteType}: ${rule.referenceId}`,
        });
      }
    }

    const requiredUnmet = unmet.filter((u) => u.isRequired);
    return { met: requiredUnmet.length === 0, unmet };
  }

  // ── Exclusions ────────────────────────────────────────────────────────────

  async addExclusion(
    organizationId: string,
    programId: string,
    dto: AddExclusionDto,
    actorId: string,
  ): Promise<ProgramExclusionDocument> {
    const program = await this.getProgram(organizationId, programId);

    const existing = await this.exclusionModel
      .findOne({ programId: program._id, exclusionType: dto.exclusionType })
      .exec();
    if (existing) {
      throw new ResourceConflictException(
        `An exclusion rule of type '${dto.exclusionType}' already exists`,
        ErrorCode.BIZ_EXCLUSION_DUPLICATE,
      );
    }

    return this.exclusionModel.create({
      organizationId,
      programId: program._id,
      exclusionType: dto.exclusionType,
      reasonCode: dto.reasonCode,
      parameters: dto.parameters ?? {},
      description: dto.description,
      createdBy: actorId,
    });
  }

  async removeExclusion(
    organizationId: string,
    programId: string,
    exclusionId: string,
    _actorId: string,
  ): Promise<void> {
    const rule = await this.exclusionModel
      .findOne({ _id: exclusionId, programId, organizationId })
      .exec();
    if (!rule) {
      throw new ResourceNotFoundException(
        'Exclusion rule not found',
        ErrorCode.RES_PROGRAM_EXCLUSION_NOT_FOUND,
      );
    }
    await this.exclusionModel.deleteOne({ _id: rule._id }).exec();
  }

  async listExclusions(
    organizationId: string,
    programId: string,
  ): Promise<ProgramExclusionDocument[]> {
    return this.exclusionModel
      .find({ programId, organizationId })
      .sort({ exclusionType: 1 })
      .exec();
  }

  /**
   * Evaluates exclusion rules for an applicant.
   * Deterministic: same `applicantClaims` + same rules = same decision.
   *
   * @param programId      The program.
   * @param applicantClaims Claims about the applicant's current state.
   *   Expected keys:
   *     activeScholarshipIds: string[]  – concurrent award check
   *     priorAwardedProgramIds: string[] – prior award check
   *     employmentStatus: string        – 'employed' | 'unemployed' | 'student'
   *     priorRejectionCount: number     – prior rejection count for this program
   */
  async evaluateExclusions(
    programId: string,
    applicantClaims: Record<string, unknown>,
  ): Promise<ExclusionDecision> {
    const rules = await this.exclusionModel.find({ programId }).exec();
    const reasons: ExclusionDecision['reasons'] = [];

    for (const rule of rules) {
      const excluded = this.evaluateSingleExclusion(rule, applicantClaims);
      if (excluded) {
        reasons.push({
          exclusionType: rule.exclusionType,
          reasonCode: rule.reasonCode,
          description: rule.description ?? `Excluded by ${rule.exclusionType} rule`,
        });
      }
    }

    return { excluded: reasons.length > 0, reasons };
  }

  /**
   * Validates rules before program publication.
   *
   * Checks:
   *   1. No SCHOLARSHIP_AWARD prerequisite references the program itself
   *      (self-referential cycle — A requires an award from A).
   *
   * Throws BIZ_PREREQUISITE_CYCLE_DETECTED if a cycle is found.
   */
  async validateBeforePublish(
    organizationId: string,
    programId: string,
  ): Promise<void> {
    const prerequisites = await this.prerequisiteModel
      .find({ programId, organizationId })
      .exec();

    for (const prereq of prerequisites) {
      if (prereq.prerequisiteType === PrerequisiteType.SCHOLARSHIP_AWARD) {
        if (prereq.referenceId === programId) {
          throw new ResourceConflictException(
            `Self-referential prerequisite cycle detected: program ${programId} requires an award from itself`,
            ErrorCode.BIZ_PREREQUISITE_CYCLE_DETECTED,
          );
        }
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getProgram(
    organizationId: string,
    programId: string,
  ): Promise<ScholarshipProgramDocument> {
    const program = await this.programModel
      .findOne({ _id: programId, organizationId })
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }
    return program;
  }

  private evaluateSingleExclusion(
    rule: ProgramExclusionDocument,
    claims: Record<string, unknown>,
  ): boolean {
    switch (rule.exclusionType) {
      case ExclusionType.CONCURRENT_SCHOLARSHIP: {
        const active = (claims['activeScholarshipIds'] as string[]) ?? [];
        return active.length > 0;
      }
      case ExclusionType.PRIOR_AWARD: {
        const priorAwards = (claims['priorAwardedProgramIds'] as string[]) ?? [];
        return priorAwards.includes(String(rule.parameters['targetProgramId'] ?? ''));
      }
      case ExclusionType.EMPLOYMENT_STATUS: {
        const disallowed = (rule.parameters['disallowedStatuses'] as string[]) ?? ['employed'];
        return disallowed.includes(String(claims['employmentStatus'] ?? ''));
      }
      case ExclusionType.PRIOR_REJECTION: {
        const maxRejections = Number(rule.parameters['maxPriorRejections'] ?? 0);
        return Number(claims['priorRejectionCount'] ?? 0) >= maxRejections;
      }
      default:
        return false;
    }
  }
}
