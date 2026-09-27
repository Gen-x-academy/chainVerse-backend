import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ApplicationDraft,
  ApplicationDraftDocument,
} from './schemas/application-draft.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
  ScholarshipProgramStatus,
} from '../scholarships/schemas/scholarship-program.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
  ScholarshipApplicationStatus,
} from '../scholarships/schemas/scholarship-application.schema';
import {
  ReviewInfoRequest,
  ReviewInfoRequestDocument,
} from '../scholarships/schemas/review-info-request.schema';
import {
  SaveDraftDto,
  SubmitDraftDto,
  DiscoverProgramsQueryDto,
  ApplicationStatusQueryDto,
  ProgramCardDto,
  ApplicationStatusCardDto,
  StudentDashboardSnapshotDto,
} from './dto/student-dashboard.dto';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';

/**
 * ScholarshipStudentDashboardService
 *
 * Provides the authoritative read and write operations for a scholarship
 * applicant's personal dashboard view.  All queries are scoped to the
 * requesting applicant (`applicantId = JWT sub`) — no cross-applicant data
 * is ever returned.
 *
 * Ownership: student-facing; no reviewer scores or internal financial data
 * are exposed.
 *
 * Privacy: answers and statements may contain PII; access is guarded at the
 * controller layer via JwtAuthGuard + applicant-id ownership check.
 */
@Injectable()
export class ScholarshipStudentDashboardService {
  constructor(
    @InjectModel(ApplicationDraft.name)
    private readonly draftModel: Model<ApplicationDraftDocument>,
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    @InjectModel(ReviewInfoRequest.name)
    private readonly infoRequestModel: Model<ReviewInfoRequestDocument>,
  ) {}

  // ── Discovery ───────────────────────────────────────────────────────────────

  /**
   * Returns paginated published scholarship programs visible to any applicant.
   * Annotates each card with whether the calling applicant has already applied.
   */
  async discoverPrograms(
    applicantId: string,
    query: DiscoverProgramsQueryDto,
  ): Promise<{ data: ProgramCardDto[]; total: number; page: number; limit: number }> {
    const status = query.status ?? ScholarshipProgramStatus.PUBLISHED;
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const [programs, total] = await Promise.all([
      this.programModel
        .find({ status })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.programModel.countDocuments({ status }).exec(),
    ]);

    // Determine which programs this applicant has already applied to.
    const programIds = programs.map((p) => p._id);
    const existingApplications = await this.applicationModel
      .find({ applicantId, programId: { $in: programIds } })
      .select('programId')
      .lean()
      .exec();
    const appliedProgramIds = new Set(
      existingApplications.map((a) => String(a.programId)),
    );

    const data: ProgramCardDto[] = programs.map((p) => ({
      programId: String(p._id),
      organizationId: p.organizationId,
      title: p.title,
      description: p.description,
      status: p.status,
      applicantHasApplied: appliedProgramIds.has(String(p._id)),
    }));

    return { data, total, page, limit };
  }

  // ── Drafts ──────────────────────────────────────────────────────────────────

  /**
   * Creates or overwrites an applicant's draft for the given program.
   * At most one non-submitted draft is allowed per (program, applicant) pair.
   */
  async saveDraft(
    applicantId: string,
    dto: SaveDraftDto,
  ): Promise<ApplicationDraftDocument> {
    // Verify the program exists and is published.
    const program = await this.programModel
      .findOne({
        _id: dto.programId,
        organizationId: dto.organizationId,
        status: ScholarshipProgramStatus.PUBLISHED,
      })
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found or is not accepting applications',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }

    // Check for an existing submitted application — disallow a second draft.
    const existingApplication = await this.applicationModel
      .findOne({ programId: dto.programId, applicantId })
      .exec();
    if (existingApplication) {
      throw new ResourceConflictException(
        'You have already submitted an application for this program',
        ErrorCode.BIZ_APPLICATION_ALREADY_EXISTS,
      );
    }

    // Upsert the draft (create on first save, update on subsequent saves).
    const existing = await this.draftModel
      .findOne({ programId: dto.programId, applicantId, submitted: false })
      .exec();
    if (existing) {
      if (dto.answers !== undefined) existing.answers = dto.answers;
      if (dto.statement !== undefined) existing.statement = dto.statement;
      return existing.save();
    }

    return this.draftModel.create({
      organizationId: dto.organizationId,
      programId: new Types.ObjectId(dto.programId),
      applicantId,
      answers: dto.answers ?? {},
      statement: dto.statement,
      submitted: false,
      submittedAt: null,
    });
  }

  /** Returns all active (non-submitted) drafts for an applicant. */
  async listDrafts(applicantId: string): Promise<ApplicationDraftDocument[]> {
    return this.draftModel
      .find({ applicantId, submitted: false })
      .sort({ updatedAt: -1 })
      .exec();
  }

  /** Returns a single draft, enforcing ownership. */
  async getDraft(
    applicantId: string,
    draftId: string,
  ): Promise<ApplicationDraftDocument> {
    const draft = await this.draftModel.findById(draftId).exec();
    if (!draft) {
      throw new ResourceNotFoundException(
        'Draft not found',
        ErrorCode.RES_DRAFT_APPLICATION_NOT_FOUND,
      );
    }
    if (draft.applicantId !== applicantId) {
      throw new ForbiddenException('You do not own this draft');
    }
    return draft;
  }

  /**
   * Marks a draft as submitted (the actual application is created by
   * ScholarshipsModule; this service only marks the draft record).
   *
   * Validates that all required form fields have answers before allowing
   * the submission transition.
   */
  async submitDraft(
    applicantId: string,
    draftId: string,
    dto: SubmitDraftDto,
  ): Promise<ApplicationDraftDocument> {
    const draft = await this.getDraft(applicantId, draftId);

    if (draft.submitted) {
      throw new BusinessRuleException(
        'This draft has already been submitted',
        ErrorCode.BIZ_APPLICATION_ALREADY_EXISTS,
      );
    }

    // Apply any final edits before submission.
    if (dto.answers !== undefined) draft.answers = dto.answers;
    if (dto.statement !== undefined) draft.statement = dto.statement;

    // Load the program to validate required fields.
    const program = await this.programModel.findById(draft.programId).exec();
    if (program) {
      const missingRequired = program.formFields
        .filter((f) => f.required)
        .filter((f) => !draft.answers[String(f._id)]?.trim());
      if (missingRequired.length > 0) {
        throw new BusinessRuleException(
          `Required fields are missing: ${missingRequired.map((f) => f.label).join(', ')}`,
          ErrorCode.BIZ_DRAFT_INCOMPLETE,
        );
      }
    }

    draft.submitted = true;
    draft.submittedAt = new Date();
    return draft.save();
  }

  /** Deletes a non-submitted draft; enforces ownership. */
  async deleteDraft(applicantId: string, draftId: string): Promise<void> {
    const draft = await this.getDraft(applicantId, draftId);
    if (draft.submitted) {
      throw new BusinessRuleException(
        'Submitted drafts cannot be deleted',
        ErrorCode.BIZ_APPLICATION_ALREADY_EXISTS,
      );
    }
    await this.draftModel.deleteOne({ _id: draftId }).exec();
  }

  // ── My Applications ─────────────────────────────────────────────────────────

  /**
   * Returns paginated application status cards for the calling applicant.
   * Annotates each card with whether there is an open info-request.
   */
  async listMyApplications(
    applicantId: string,
    query: ApplicationStatusQueryDto,
  ): Promise<{ data: ApplicationStatusCardDto[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { applicantId };
    if (query.status) filter.status = query.status;

    const [applications, total] = await Promise.all([
      this.applicationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.applicationModel.countDocuments(filter).exec(),
    ]);

    if (applications.length === 0) {
      return { data: [], total, page, limit };
    }

    // Resolve program titles.
    const programIds = [...new Set(applications.map((a) => String(a.programId)))];
    const programs = await this.programModel
      .find({ _id: { $in: programIds } })
      .select('title')
      .lean()
      .exec();
    const programTitleMap = Object.fromEntries(
      programs.map((p) => [String(p._id), p.title]),
    );

    // Determine which applications have open info-requests.
    const appIds = applications.map((a) => String(a._id));
    const openRequests = await this.infoRequestModel
      .find({
        applicationId: { $in: appIds.map((id) => new Types.ObjectId(id)) },
        status: 'open',
      })
      .select('applicationId')
      .lean()
      .exec();
    const openRequestAppIds = new Set(
      openRequests.map((r) => String(r.applicationId)),
    );

    const data: ApplicationStatusCardDto[] = applications.map((app) => {
      const appId = String(app._id);
      const hasPending = openRequestAppIds.has(appId);
      return {
        applicationId: appId,
        programId: String(app.programId),
        programTitle: programTitleMap[String(app.programId)] ?? 'Unknown Program',
        status: app.status,
        submittedAt: app.createdAt,
        decidedAt: app.decidedAt,
        decisionReason: app.decisionReason,
        hasPendingInfoRequest: hasPending,
        nextAction: this.resolveNextAction(app.status, hasPending),
      };
    });

    return { data, total, page, limit };
  }

  // ── Dashboard Snapshot ──────────────────────────────────────────────────────

  /**
   * Returns aggregate counts and recent activity for the student's dashboard
   * landing page.  Computed live from authoritative collections; not cached.
   */
  async getSnapshot(applicantId: string): Promise<StudentDashboardSnapshotDto> {
    const [statusCounts, draftsCount, recentApps, openRequests] =
      await Promise.all([
        // Count by application status.
        this.applicationModel.aggregate<{ _id: ScholarshipApplicationStatus; count: number }>([
          { $match: { applicantId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        // Count active drafts.
        this.draftModel.countDocuments({ applicantId, submitted: false }),
        // Last 5 applications.
        this.applicationModel
          .find({ applicantId })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
          .exec(),
        // Open info-requests for this applicant's applications.
        this.infoRequestModel
          .find({ applicantId, status: 'open' })
          .select('_id applicationId')
          .lean()
          .exec(),
      ]);

    const byStatus = Object.fromEntries(
      statusCounts.map((s) => [s._id, s.count]),
    ) as Partial<Record<ScholarshipApplicationStatus, number>>;

    // Resolve program titles for recent apps.
    const programIds = [...new Set(recentApps.map((a) => String(a.programId)))];
    const programs = await this.programModel
      .find({ _id: { $in: programIds } })
      .select('title')
      .lean()
      .exec();
    const titleMap = Object.fromEntries(programs.map((p) => [String(p._id), p.title]));

    const openRequestAppIds = new Set(
      openRequests.map((r) => String(r.applicationId)),
    );

    const recentApplications: ApplicationStatusCardDto[] = recentApps.map((app) => {
      const appId = String(app._id);
      const hasPending = openRequestAppIds.has(appId);
      return {
        applicationId: appId,
        programId: String(app.programId),
        programTitle: titleMap[String(app.programId)] ?? 'Unknown Program',
        status: app.status,
        submittedAt: app.createdAt,
        decidedAt: app.decidedAt,
        decisionReason: app.decisionReason,
        hasPendingInfoRequest: hasPending,
        nextAction: this.resolveNextAction(app.status, hasPending),
      };
    });

    return {
      applicantId,
      totalDrafts: draftsCount,
      totalSubmitted:
        (byStatus[ScholarshipApplicationStatus.SUBMITTED] ?? 0) +
        (byStatus[ScholarshipApplicationStatus.UNDER_REVIEW] ?? 0),
      totalUnderReview: byStatus[ScholarshipApplicationStatus.UNDER_REVIEW] ?? 0,
      totalApproved: byStatus[ScholarshipApplicationStatus.APPROVED] ?? 0,
      totalRejected: byStatus[ScholarshipApplicationStatus.REJECTED] ?? 0,
      totalWithdrawn: byStatus[ScholarshipApplicationStatus.WITHDRAWN] ?? 0,
      recentApplications,
      openInfoRequests: openRequests.map((r) => String(r._id)),
      computedAt: new Date(),
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private resolveNextAction(
    status: ScholarshipApplicationStatus,
    hasPendingInfoRequest: boolean,
  ): string | undefined {
    if (hasPendingInfoRequest) return 'respond_to_info_request';
    switch (status) {
      case ScholarshipApplicationStatus.APPROVED:
        return 'accept_award';
      case ScholarshipApplicationStatus.SUBMITTED:
        return 'await_review';
      case ScholarshipApplicationStatus.UNDER_REVIEW:
        return 'await_decision';
      default:
        return undefined;
    }
  }
}
