import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
  ScholarshipApplicationStatus,
} from '../schemas/scholarship-application.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
  ScholarshipProgramStatus,
} from '../schemas/scholarship-program.schema';
import {
  ProgramTermsVersion,
  ProgramTermsVersionDocument,
  TermsVersionStatus,
} from '../schemas/program-terms-version.schema';
import { ApplicationDecision } from '../dto/scholarship-application.dto';
import { AnswerDto, DEFAULT_ANSWER_WORD_LIMIT } from '../dto/answer.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

const ACTIVE_STATUSES = [
  ScholarshipApplicationStatus.SUBMITTED,
  ScholarshipApplicationStatus.UNDER_REVIEW,
];

// ── Answer validation helpers ─────────────────────────────────────────────────

/**
 * Counts words in a string using Unicode-aware whitespace splitting.
 * Returns 0 for absent or blank values.
 *
 * The algorithm intentionally mirrors common client-side implementations
 * (split on /\s+/, filter empty strings) so client and server word counts
 * agree within a ±1 rounding tolerance.
 */
export function countWords(text: string | undefined | null): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

/**
 * Validates the answers array supplied with an application against the
 * program's form field definitions.
 *
 * Validations performed (in order):
 *   1. Duplicate field ids rejected.
 *   2. Unknown field ids rejected (safe path: `answers[N].fieldId`).
 *   3. Required fields without a non-empty answer rejected.
 *   4. Word count exceeding the field's `wordLimit` rejected.
 *      Uses `DEFAULT_ANSWER_WORD_LIMIT` when the field has no explicit limit.
 *
 * Errors include a `field` path of the form `answers[N].value` so that
 * clients can surface them next to the correct form control without
 * exposing any internal schema details.
 *
 * @throws ValidationDomainException on the first validation failure group.
 */
export function validateAnswers(
  answers: AnswerDto[],
  formFields: Array<{
    _id: Types.ObjectId | string;
    required: boolean;
    wordLimit: number | null;
    label: string;
  }>,
): void {
  // 1. Duplicate field id check
  const seen = new Set<string>();
  for (let i = 0; i < answers.length; i++) {
    const key = answers[i].fieldId;
    if (seen.has(key)) {
      throw new ValidationDomainException(
        `Duplicate answer for field id '${key}' at answers[${i}].fieldId.`,
        ErrorCode.VAL_ANSWER_DUPLICATE_FIELD,
      );
    }
    seen.add(key);
  }

  // Build a lookup map for O(1) field access
  const fieldMap = new Map(
    formFields.map((f) => [f._id.toString(), f]),
  );

  // 2. Unknown field id check
  for (let i = 0; i < answers.length; i++) {
    if (!fieldMap.has(answers[i].fieldId)) {
      throw new ValidationDomainException(
        `answers[${i}].fieldId references an unknown form field '${answers[i].fieldId}'.`,
        ErrorCode.VAL_ANSWER_UNKNOWN_FIELD,
      );
    }
  }

  // 3. Required field check
  const answeredFields = new Set(answers.map((a) => a.fieldId));
  for (const field of formFields) {
    if (field.required && !answeredFields.has(field._id.toString())) {
      throw new ValidationDomainException(
        `Required field '${field.label}' (id: ${field._id}) has no answer.`,
        ErrorCode.VAL_ANSWER_REQUIRED_FIELD_MISSING,
      );
    }
  }

  // 4. Word limit check
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    const field = fieldMap.get(answer.fieldId)!;
    const limit = field.wordLimit ?? DEFAULT_ANSWER_WORD_LIMIT;
    const serverCount = countWords(answer.value);

    if (serverCount > limit) {
      throw new ValidationDomainException(
        `answers[${i}].value exceeds the word limit for field '${field.label}' ` +
          `(${serverCount} words, limit is ${limit}).`,
        ErrorCode.VAL_ANSWER_WORD_LIMIT_EXCEEDED,
      );
    }
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ScholarshipApplicationsService {
  constructor(
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
    @InjectModel(ProgramTermsVersion.name)
    private readonly termsModel: Model<ProgramTermsVersionDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async apply(
    input: {
      organizationId: string;
      programId: string;
      acceptedTermsVersionId: string;
      statement?: string;
      answers?: AnswerDto[];
    },
    applicantId: string,
  ): Promise<ScholarshipApplicationDocument> {
    const program = await this.programModel
      .findOne({ _id: input.programId, organizationId: input.organizationId })
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }

    // Accept applications for PUBLISHED programs only.
    // Note: pre-#1122 documents may still carry the old 'open' value — those
    // are treated as not open until the migration script is run.
    if (program.status !== ScholarshipProgramStatus.PUBLISHED) {
      throw new ResourceConflictException(
        'Scholarship program is not open for applications',
        ErrorCode.BIZ_PROGRAM_NOT_OPEN,
      );
    }

    const terms = await this.termsModel
      .findOne({
        _id: input.acceptedTermsVersionId,
        programId: program._id,
        organizationId: input.organizationId,
      })
      .exec();
    if (!terms) {
      throw new ResourceNotFoundException(
        'Terms version not found',
        ErrorCode.RES_TERMS_VERSION_NOT_FOUND,
      );
    }
    if (terms.status !== TermsVersionStatus.PUBLISHED) {
      throw new ResourceConflictException(
        'Applications must accept the currently published terms version',
        ErrorCode.BIZ_TERMS_VERSION_NOT_PUBLISHED,
      );
    }

    const existing = await this.applicationModel
      .findOne({ programId: program._id, applicantId })
      .exec();
    if (existing) {
      throw new ResourceConflictException(
        'You have already applied to this program',
        ErrorCode.BIZ_APPLICATION_ALREADY_EXISTS,
      );
    }

    // ── Answer validation (issue #1132) ─────────────────────────────────────
    const answers = input.answers ?? [];
    validateAnswers(answers, program.formFields ?? []);

    // Compute server-side word counts for persisted answers
    const persistedAnswers = answers.map((a) => ({
      fieldId: new Types.ObjectId(a.fieldId),
      value: a.value,
      wordCount: countWords(a.value),
    }));

    return this.applicationModel.create({
      organizationId: input.organizationId,
      programId: program._id,
      applicantId,
      acceptedTermsVersionId: terms._id,
      acceptedTermsVersionNumber: terms.versionNumber,
      acceptedTermsSnapshot: {
        versionNumber: terms.versionNumber,
        eligibility: terms.eligibility,
        deadlines: terms.deadlines,
        awardValue: terms.awardValue,
        awardCurrency: terms.awardCurrency ?? null,
        obligations: terms.obligations,
        publishedAt: terms.publishedAt ?? null,
      },
      status: ScholarshipApplicationStatus.SUBMITTED,
      statement: input.statement,
      answers: persistedAnswers,
    });
  }

  async listMine(applicantId: string): Promise<ScholarshipApplicationDocument[]> {
    return this.applicationModel
      .find({ applicantId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getApplicationForApplicant(
    applicationId: string,
    applicantId: string,
  ): Promise<ScholarshipApplicationDocument> {
    const application = await this.applicationModel
      .findById(applicationId)
      .exec();
    if (!application || application.applicantId !== applicantId) {
      throw new ResourceNotFoundException(
        'Scholarship application not found',
        ErrorCode.RES_SCHOLARSHIP_APPLICATION_NOT_FOUND,
      );
    }
    return application;
  }

  async withdraw(
    applicationId: string,
    applicantId: string,
  ): Promise<ScholarshipApplicationDocument> {
    const application = await this.applicationModel
      .findById(applicationId)
      .exec();
    if (!application) {
      throw new ResourceNotFoundException(
        'Scholarship application not found',
        ErrorCode.RES_SCHOLARSHIP_APPLICATION_NOT_FOUND,
      );
    }
    if (application.applicantId !== applicantId) {
      throw new ForbiddenDomainException(
        'You can only withdraw your own application',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    if (!ACTIVE_STATUSES.includes(application.status)) {
      throw new ResourceConflictException(
        'This application can no longer be withdrawn',
        ErrorCode.BIZ_APPLICATION_NOT_WITHDRAWABLE,
      );
    }

    return (await this.applicationModel
      .findOneAndUpdate(
        { _id: application._id, status: { $in: ACTIVE_STATUSES } },
        { $set: { status: ScholarshipApplicationStatus.WITHDRAWN } },
        { new: true },
      )
      .exec()) as ScholarshipApplicationDocument;
  }

  async listForProgram(
    organizationId: string,
    programId: string,
    filters: { status?: ScholarshipApplicationStatus },
    pagination?: PaginationDto,
  ) {
    const program = await this.programModel
      .findOne({ _id: programId, organizationId })
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }

    const filter: Record<string, unknown> = { organizationId, programId };
    if (filters.status) filter.status = filters.status;

    if (pagination) {
      return this.paginationService.paginate(
        this.applicationModel,
        pagination,
        filter,
      );
    }
    return this.applicationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
  }

  async review(
    organizationId: string,
    applicationId: string,
    decision: ApplicationDecision,
    actorId: string,
    reason?: string,
  ): Promise<ScholarshipApplicationDocument> {
    const application = await this.applicationModel
      .findById(applicationId)
      .exec();
    if (!application || application.organizationId !== organizationId) {
      throw new ResourceNotFoundException(
        'Scholarship application not found',
        ErrorCode.RES_SCHOLARSHIP_APPLICATION_NOT_FOUND,
      );
    }
    if (!ACTIVE_STATUSES.includes(application.status)) {
      throw new ResourceConflictException(
        'This application has already been decided',
        ErrorCode.BIZ_APPLICATION_NOT_REVIEWABLE,
      );
    }

    const nextStatus =
      decision === ApplicationDecision.APPROVED
        ? ScholarshipApplicationStatus.APPROVED
        : ScholarshipApplicationStatus.REJECTED;

    return (await this.applicationModel
      .findOneAndUpdate(
        { _id: application._id, status: { $in: ACTIVE_STATUSES } },
        {
          $set: {
            status: nextStatus,
            decidedAt: new Date(),
            decidedBy: actorId,
            decisionReason: reason ?? null,
          },
        },
        { new: true },
      )
      .exec()) as ScholarshipApplicationDocument;
  }
}
