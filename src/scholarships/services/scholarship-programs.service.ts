import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
  ScholarshipProgramStatus,
  PROGRAM_STATUS_TRANSITIONS,
} from '../schemas/scholarship-program.schema';
import {
  ProgramTermsVersion,
  ProgramTermsVersionDocument,
  TermsVersionStatus,
} from '../schemas/program-terms-version.schema';
import { CreateTermsVersionDto } from '../dto/program-terms.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

@Injectable()
export class ScholarshipProgramsService {
  constructor(
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
    @InjectModel(ProgramTermsVersion.name)
    private readonly termsModel: Model<ProgramTermsVersionDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async createProgram(
    input: {
      organizationId: string;
      title: string;
      description?: string;
    },
    actorId: string,
  ): Promise<ScholarshipProgramDocument> {
    return this.programModel.create({
      organizationId: input.organizationId,
      title: input.title,
      description: input.description,
      status: ScholarshipProgramStatus.DRAFT,
      createdBy: actorId,
      currentTermsVersionNumber: 0,
      formFields: [],
      statusChangedAt: null,
      statusChangedBy: null,
      statusHistory: [],
    });
  }

  async listPrograms(
    organizationId: string,
    filters: {
      status?: ScholarshipProgramStatus;
      search?: string;
      minAwardValue?: number;
      maxAwardValue?: number;
      awardCurrency?: string;
      deadlineBefore?: Date;
      deadlineAfter?: Date;
      fundingType?: 'horizon' | 'manual' | 'deposit';
      network?: 'testnet' | 'public';
      includeClosed?: boolean;
    },
    pagination?: PaginationDto,
  ) {
    const filter: Record<string, unknown> = { organizationId };
    if (filters.status) filter.status = filters.status;

    // The catalog is a discovery surface: by default it must not surface
    // programs a student can no longer apply to. Staff pass includeClosed=true
    // for audits and reconciliation.
    if (!filters.includeClosed) {
      filter.status = { $in: [ScholarshipProgramStatus.PUBLISHED] };
    } else if (filters.status) {
      filter.status = filters.status;
    }

    if (filters.search) {
      // Escaped so a query containing regex metacharacters is treated as
      // literal text rather than being interpreted as a pattern.
      const needle = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(needle, 'i');
      filter.$or = [{ title: regex }, { description: regex }];
    }

    if (filters.minAwardValue !== undefined || filters.maxAwardValue !== undefined) {
      const range: Record<string, number> = {};
      if (filters.minAwardValue !== undefined) range.$gte = filters.minAwardValue;
      if (filters.maxAwardValue !== undefined) range.$lte = filters.maxAwardValue;
      filter.awardValue = range;
    }

    if (filters.awardCurrency) {
      filter.awardCurrency = filters.awardCurrency.toUpperCase();
    }

    if (filters.deadlineBefore || filters.deadlineAfter) {
      const range: Record<string, Date> = {};
      if (filters.deadlineAfter) range.$gte = filters.deadlineAfter;
      if (filters.deadlineBefore) range.$lte = filters.deadlineBefore;
      filter.applicationDeadline = range;
    }

    if (filters.fundingType) filter.fundingType = filters.fundingType;
    if (filters.network) filter.network = filters.network;

    if (pagination) {
      return this.paginationService.paginate(
        this.programModel,
        pagination,
        filter,
      );
    }
    return this.programModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
  }

  async getProgram(
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

  /**
   * Validates and applies a lifecycle status transition (issue #1122).
   *
   * This is the only way a program's status may change.  The legacy
   * `setProgramStatus` bypass (which wrote an arbitrary status with no
   * state-machine check) was removed in #1248, because it allowed a CLOSED
   * or ARCHIVED program to be silently reopened without an audit entry.
   *
   * Rules enforced:
   *   1. The program must exist in the requesting organization (tenant guard).
   *   2. Archived programs cannot be transitioned further.
   *   3. The `(current → requested)` pair must appear in PROGRAM_STATUS_TRANSITIONS.
   *   4. The transition is recorded in `statusHistory` (append-only audit trail).
   *   5. The write is conditional on the status read in step 1, so two
   *      concurrent transitions cannot both succeed.
   *
   * @param organizationId  Tenant scope — verified by OrganizationRolesGuard before this call.
   * @param programId       MongoDB ObjectId of the program.
   * @param targetStatus    The desired next lifecycle state.
   * @param actorId         JWT `sub` of the staff member triggering the transition.
   */
  async transitionProgramStatus(
    organizationId: string,
    programId: string,
    targetStatus: ScholarshipProgramStatus,
    actorId: string,
  ): Promise<ScholarshipProgramDocument> {
    const program = await this.getProgram(organizationId, programId);

    if (program.status === ScholarshipProgramStatus.ARCHIVED) {
      throw new BusinessRuleException(
        'Archived programs cannot be modified.',
        ErrorCode.BIZ_PROGRAM_ARCHIVED,
      );
    }

    const allowed = PROGRAM_STATUS_TRANSITIONS[program.status];
    if (!allowed.includes(targetStatus)) {
      throw new BusinessRuleException(
        `Cannot transition program from '${program.status}' to '${targetStatus}'. ` +
          `Allowed next states: ${allowed.length ? allowed.join(', ') : '(none — terminal state)'}`,
        ErrorCode.BIZ_PROGRAM_INVALID_TRANSITION,
      );
    }

    const now = new Date();
    const historyEntry = {
      status: targetStatus,
      changedBy: actorId,
      changedAt: now,
    };

    const updated = await this.programModel
      .findOneAndUpdate(
        { _id: programId, organizationId, status: program.status },
        {
          $set: {
            status: targetStatus,
            statusChangedAt: now,
            statusChangedBy: actorId,
          },
          $push: { statusHistory: historyEntry },
        },
        { new: true },
      )
      .exec();

    // The conditional filter means a concurrent transition already moved the
    // program out of `program.status`; surface that instead of returning null.
    if (!updated) {
      throw new ResourceConflictException(
        'The program changed status concurrently; re-read it and retry',
        ErrorCode.BIZ_PROGRAM_INVALID_TRANSITION,
      );
    }

    return updated as ScholarshipProgramDocument;
  }

  async createTermsDraft(
    organizationId: string,
    programId: string,
    dto: CreateTermsVersionDto,
    actorId: string,
  ): Promise<ProgramTermsVersionDocument> {
    const program = await this.getProgram(organizationId, programId);

    const latest = await this.termsModel
      .findOne({ programId: program._id })
      .sort({ versionNumber: -1 })
      .exec();
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    return this.termsModel.create({
      organizationId,
      programId: program._id,
      versionNumber,
      status: TermsVersionStatus.DRAFT,
      eligibility: dto.eligibility,
      deadlines: dto.deadlines,
      awardValue: dto.awardValue,
      awardCurrency: dto.awardCurrency,
      obligations: dto.obligations ?? [],
      createdBy: actorId,
    });
  }

  async publishTerms(
    organizationId: string,
    programId: string,
    versionId: string,
    actorId: string,
  ): Promise<ProgramTermsVersionDocument> {
    const program = await this.getProgram(organizationId, programId);
    const version = await this.termsModel
      .findOne({ _id: versionId, programId: program._id, organizationId })
      .exec();
    if (!version) {
      throw new ResourceNotFoundException(
        'Terms version not found',
        ErrorCode.RES_TERMS_VERSION_NOT_FOUND,
      );
    }
    if (version.status !== TermsVersionStatus.DRAFT) {
      throw new ResourceConflictException(
        'Only draft terms versions can be published',
        ErrorCode.BIZ_TERMS_VERSION_NOT_DRAFT,
      );
    }

    await this.termsModel
      .updateMany(
        { programId: program._id, status: TermsVersionStatus.PUBLISHED },
        { $set: { status: TermsVersionStatus.SUPERSEDED } },
      )
      .exec();

    const published = (await this.termsModel
      .findOneAndUpdate(
        { _id: version._id, status: TermsVersionStatus.DRAFT },
        {
          $set: {
            status: TermsVersionStatus.PUBLISHED,
            publishedAt: new Date(),
            publishedBy: actorId,
          },
        },
        { new: true },
      )
      .exec()) as ProgramTermsVersionDocument;

    await this.programModel
      .updateOne(
        { _id: program._id },
        {
          $set: {
            currentTermsVersionId: version._id,
            currentTermsVersionNumber: version.versionNumber,
            // Keep the catalog's denormalized search projection in step with the
            // revision that just became current (#1175). Without this the award
            // and deadline filters would silently keep matching the *previous*
            // terms — a stale read that no test of the filter itself would catch.
            awardValue: version.awardValue ?? 0,
            awardCurrency: version.awardCurrency ?? null,
            applicationDeadline: deadlineOf(version),
          },
        },
      )
      .exec();

    return published;
  }

  async listTerms(
    organizationId: string,
    programId: string,
  ): Promise<ProgramTermsVersionDocument[]> {
    await this.getProgram(organizationId, programId);
    return this.termsModel
      .find({ programId, organizationId })
      .sort({ versionNumber: -1 })
      .exec();
  }

  async getTermsVersion(
    organizationId: string,
    programId: string,
    versionId: string,
  ): Promise<ProgramTermsVersionDocument> {
    const version = await this.termsModel
      .findOne({ _id: versionId, programId, organizationId })
      .exec();
    if (!version) {
      throw new ResourceNotFoundException(
        'Terms version not found',
        ErrorCode.RES_TERMS_VERSION_NOT_FOUND,
      );
    }
    return version;
  }
}

/**
 * Extracts the application deadline from a terms revision's `deadlines` map.
 *
 * `deadlines` is an untyped `Record<string, unknown>` so that sponsors can
 * publish domain-specific dates without a schema migration. That flexibility
 * means the consumer has to know which keys are actually read, and this is the
 * single place that knows: it checks the conventional keys in priority order and
 * returns the first date-shaped value.
 *
 * Returns null when the revision publishes no recognizable deadline, which the
 * catalog stores as "no deadline" rather than guessing.
 */
function deadlineOf(terms: {
  deadlines?: Record<string, unknown>;
}): Date | null {
  const deadlines = terms?.deadlines;
  if (!deadlines || typeof deadlines !== 'object') return null;

  for (const key of [
    'closesAt',
    'applicationDeadline',
    'dueAt',
    'deadline',
    'closes',
    'applicationsClose',
  ]) {
    const value = deadlines[key];
    if (value instanceof Date) return value;
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
      return new Date(value);
    }
  }
  return null;
}
