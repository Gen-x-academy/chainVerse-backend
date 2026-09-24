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
    filters: { status?: ScholarshipProgramStatus },
    pagination?: PaginationDto,
  ) {
    const filter: Record<string, unknown> = { organizationId };
    if (filters.status) filter.status = filters.status;

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
   * Legacy status setter — no transition validation, kept for compatibility.
   * New callers should use `transitionProgramStatus` which enforces the state
   * machine and records the actor/timestamp.
   */
  async setProgramStatus(
    organizationId: string,
    programId: string,
    status: ScholarshipProgramStatus,
  ): Promise<ScholarshipProgramDocument> {
    await this.getProgram(organizationId, programId);
    return (await this.programModel
      .findOneAndUpdate(
        { _id: programId, organizationId },
        { $set: { status } },
        { new: true },
      )
      .exec()) as ScholarshipProgramDocument;
  }

  /**
   * Validates and applies a lifecycle status transition (issue #1122).
   *
   * Rules enforced:
   *   1. The program must exist in the requesting organization (tenant guard).
   *   2. Archived programs cannot be transitioned further.
   *   3. The `(current → requested)` pair must appear in PROGRAM_STATUS_TRANSITIONS.
   *   4. The transition is recorded in `statusHistory` (append-only audit trail).
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

    return (await this.programModel
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
      .exec()) as ScholarshipProgramDocument;
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
