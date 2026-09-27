import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ApplicationAppeal,
  ApplicationAppealDocument,
  AppealStatus,
  AppealGrounds,
  ACTIVE_APPEAL_STATUSES,
  TERMINAL_APPEAL_STATUSES,
} from '../schemas/application-appeal.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
  ScholarshipApplicationStatus,
} from '../schemas/scholarship-application.schema';
import {
  CommitteeDecision,
  CommitteeDecisionDocument,
  CommitteeOutcome,
} from '../schemas/committee-decision.schema';
import {
  ScholarshipReview,
  ScholarshipReviewDocument,
} from '../schemas/scholarship-review.schema';
import {
  AppealResult,
  AppealScopeQueryDto,
  AssignAppealDto,
  ListAppealsQueryDto,
  ResolveAppealDto,
  SubmitAppealDto,
  WithdrawAppealDto,
} from '../dto/application-appeal.dto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { EmailService } from '../../email/email.service';

// ── Default resolution window (days) ─────────────────────────────────────────

/** Fallback number of days from submission before a resolution is required. */
const DEFAULT_RESOLUTION_WINDOW_DAYS = 30;

// ── Serialization helpers ─────────────────────────────────────────────────────

/**
 * Maps a Mongoose document to the full API shape (staff view).
 * Includes `reviewNotes`, `excludedReviewerIds`, and `auditTrail`.
 */
function toResult(doc: ApplicationAppealDocument): AppealResult {
  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId,
    applicationId: doc.applicationId.toString(),
    programId: doc.programId.toString(),
    applicantId: doc.applicantId,
    excludedReviewerIds: doc.excludedReviewerIds,
    grounds: doc.grounds,
    statement: doc.statement,
    evidence: doc.evidence.map((e) => ({
      id: e._id.toString(),
      label: e.label,
      url: e.url,
      description: e.description,
      attachedAt: e.attachedAt.toISOString(),
    })),
    status: doc.status,
    resolutionDeadline: doc.resolutionDeadline.toISOString(),
    assignedReviewerId: doc.assignedReviewerId,
    assignedAt: doc.assignedAt?.toISOString() ?? null,
    reviewNotes: doc.reviewNotes,
    resolvedAt: doc.resolvedAt?.toISOString() ?? null,
    resolvedBy: doc.resolvedBy,
    resolutionReason: doc.resolutionReason,
    withdrawalReason: doc.withdrawalReason,
    withdrawnAt: doc.withdrawnAt?.toISOString() ?? null,
    auditTrail: doc.auditTrail.map((e) => ({
      action: e.action,
      actorId: e.actorId,
      actorDisplayName: e.actorDisplayName,
      occurredAt: e.occurredAt.toISOString(),
      payload: e.payload,
    })),
    createdAt: doc.createdAt!.toISOString(),
    updatedAt: doc.updatedAt!.toISOString(),
  };
}

/**
 * Maps a document to the restricted applicant-facing view.
 * Omits `reviewNotes`, `excludedReviewerIds`, and `auditTrail`.
 */
function toApplicantResult(doc: ApplicationAppealDocument): AppealResult {
  const full = toResult(doc);
  const { reviewNotes: _rn, excludedReviewerIds: _ex, auditTrail: _at, ...rest } = full;
  return rest as AppealResult;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ApplicationAppealService {
  private readonly logger = new Logger(ApplicationAppealService.name);

  constructor(
    @InjectModel(ApplicationAppeal.name)
    private readonly appealModel: Model<ApplicationAppealDocument>,
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    @InjectModel(CommitteeDecision.name)
    private readonly decisionModel: Model<CommitteeDecisionDocument>,
    @InjectModel(ScholarshipReview.name)
    private readonly reviewModel: Model<ScholarshipReviewDocument>,
    private readonly emailService: EmailService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Loads the application and asserts tenant ownership.
   * Throws ResourceNotFoundException if absent or mismatched.
   */
  private async resolveApplication(
    organizationId: string,
    applicationId: string,
  ): Promise<ScholarshipApplicationDocument> {
    const app = await this.applicationModel.findById(applicationId).exec();
    if (!app || app.organizationId !== organizationId) {
      throw new ResourceNotFoundException(
        'Scholarship application not found.',
        ErrorCode.RES_SCHOLARSHIP_APPLICATION_NOT_FOUND,
      );
    }
    return app;
  }

  /**
   * Loads an appeal by id and asserts tenant ownership.
   * Throws ResourceNotFoundException if absent or mismatched.
   */
  private async findAppeal(
    organizationId: string,
    appealId: string,
  ): Promise<ApplicationAppealDocument> {
    const appeal = await this.appealModel.findById(appealId).exec();
    if (!appeal || appeal.organizationId !== organizationId) {
      throw new ResourceNotFoundException(
        'Appeal not found.',
        ErrorCode.RES_APPEAL_NOT_FOUND,
      );
    }
    return appeal;
  }

  /**
   * Collects the set of reviewer ids who participated in the original review
   * of an application (via ScholarshipReview rows and CommitteeDecision votes).
   * These are excluded from reviewing the appeal.
   */
  private async collectOriginalReviewerIds(
    applicationId: string,
  ): Promise<string[]> {
    const reviewerIds = new Set<string>();

    // Scholarship review authors.
    const reviews = await this.reviewModel
      .find({ applicationId: new Types.ObjectId(applicationId) })
      .select('reviewerId')
      .lean()
      .exec();
    for (const r of reviews) {
      reviewerIds.add(r.reviewerId);
    }

    // Committee vote casters (non-superseded votes only).
    const decision = await this.decisionModel
      .findOne({ applicationId: new Types.ObjectId(applicationId) })
      .select('votes')
      .lean()
      .exec();
    if (decision) {
      for (const vote of decision.votes) {
        if (!vote.superseded) {
          reviewerIds.add(vote.memberId);
        }
      }
    }

    return Array.from(reviewerIds);
  }

  /**
   * Fires an email notification swallowing errors so that a notification
   * failure never rolls back a successful domain write.
   */
  private async notify(
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    try {
      await this.emailService.send(to, subject, body);
    } catch (err) {
      this.logger.warn(
        `Failed to send notification to ${to}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Appends an audit entry to the in-memory document (caller must save).
   */
  private appendAudit(
    appeal: ApplicationAppealDocument,
    action: string,
    actorId: string,
    actorDisplayName?: string,
    payload: Record<string, unknown> = {},
  ): void {
    appeal.auditTrail.push({
      action,
      actorId,
      actorDisplayName,
      occurredAt: new Date(),
      payload,
    } as any);
  }

  // ── Applicant: submit appeal ───────────────────────────────────────────────

  /**
   * An applicant files a new appeal against a rejected decision.
   *
   * Rules (in order):
   *   1. Application exists and is owned by `applicantId` in `organizationId`.
   *   2. Application is eligible for appeal:
   *      - Application status is REJECTED, OR
   *      - A CommitteeDecision with outcome REJECTED exists for the application.
   *   3. No active appeal (PENDING or UNDER_REVIEW) already exists for this
   *      application (BIZ_APPEAL_ALREADY_ACTIVE).
   *   4. `resolutionDeadline` (if supplied) must be in the future.
   *
   * On success:
   *   - Original reviewer ids are collected and stored in `excludedReviewerIds`.
   *   - An audit entry "submitted" is appended.
   *   - Staff are notified (best-effort).
   *
   * @param organizationId  Tenant scope.
   * @param applicationId   Target application ObjectId (hex string).
   * @param applicantId     JWT `sub` of the authenticated applicant.
   * @param dto             Validated request body.
   */
  async submitAppeal(
    organizationId: string,
    applicationId: string,
    applicantId: string,
    dto: SubmitAppealDto,
  ): Promise<AppealResult> {
    const app = await this.resolveApplication(organizationId, applicationId);

    // Ownership: only the application's own applicant may file an appeal.
    if (app.applicantId !== applicantId) {
      throw new ForbiddenDomainException(
        'Only the applicant who owns this application may file an appeal.',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    // Eligibility: application must be REJECTED or have a REJECTED committee outcome.
    const isApplicationRejected =
      app.status === ScholarshipApplicationStatus.REJECTED;

    let isDecisionRejected = false;
    if (!isApplicationRejected) {
      const decision = await this.decisionModel
        .findOne({
          applicationId: new Types.ObjectId(applicationId),
          organizationId,
        })
        .select('outcome')
        .lean()
        .exec();
      isDecisionRejected = decision?.outcome === CommitteeOutcome.REJECTED;
    }

    if (!isApplicationRejected && !isDecisionRejected) {
      throw new BusinessRuleException(
        'Appeals may only be filed against applications with a REJECTED ' +
          'status or a REJECTED committee decision outcome.',
        ErrorCode.BIZ_APPEAL_NOT_ELIGIBLE,
      );
    }

    // Uniqueness: at most one active appeal per application at a time.
    const existingActive = await this.appealModel
      .findOne({
        organizationId,
        applicationId: new Types.ObjectId(applicationId),
        status: { $in: Array.from(ACTIVE_APPEAL_STATUSES) },
      })
      .lean()
      .exec();

    if (existingActive) {
      throw new ResourceConflictException(
        'An active appeal already exists for this application. ' +
          'Only one active appeal is permitted at a time.',
        ErrorCode.BIZ_APPEAL_ALREADY_ACTIVE,
      );
    }

    // Resolution deadline — validate if supplied, else apply default.
    let resolutionDeadline: Date;
    if (dto.resolutionDeadline) {
      resolutionDeadline = new Date(dto.resolutionDeadline);
      if (resolutionDeadline <= new Date()) {
        throw new ValidationDomainException(
          'resolutionDeadline must be a future date/time.',
          ErrorCode.VAL_APPEAL_DEADLINE_PAST,
        );
      }
    } else {
      resolutionDeadline = new Date(
        Date.now() + DEFAULT_RESOLUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
    }

    // Collect original reviewer ids for exclusion.
    const excludedReviewerIds = await this.collectOriginalReviewerIds(
      applicationId,
    );

    const now = new Date();
    const evidence = (dto.evidence ?? []).map((e) => ({
      label: e.label,
      url: e.url,
      description: e.description,
      attachedAt: now,
    }));

    const created = await this.appealModel.create({
      organizationId,
      applicationId: new Types.ObjectId(applicationId),
      programId: app.programId,
      applicantId,
      excludedReviewerIds,
      grounds: dto.grounds,
      statement: dto.statement,
      evidence,
      status: AppealStatus.PENDING,
      resolutionDeadline,
      assignedReviewerId: null,
      assignedAt: null,
      reviewNotes: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionReason: null,
      withdrawalReason: null,
      withdrawnAt: null,
      auditTrail: [
        {
          action: 'submitted',
          actorId: applicantId,
          occurredAt: now,
          payload: { grounds: dto.grounds },
        },
      ],
    });

    // Notify organization staff (best-effort; recipient is the org contact,
    // represented here as organizationId for routing — replace with an actual
    // staff notification channel if available in the email service).
    await this.notify(
      organizationId,
      `New appeal filed — application ${applicationId}`,
      `Applicant ${applicantId} has filed an appeal against their decision.\n` +
        `Grounds: ${dto.grounds}\n` +
        `Resolution deadline: ${resolutionDeadline.toUTCString()}\n` +
        `Appeal id: ${created._id.toString()}`,
    );

    return toApplicantResult(created);
  }

  // ── Applicant: withdraw appeal ─────────────────────────────────────────────

  /**
   * The applicant withdraws an active appeal.
   *
   * Rules:
   *   1. Appeal exists and is scoped to `organizationId`.
   *   2. Only the applicant who filed the appeal may withdraw it.
   *   3. Appeal must be in PENDING or UNDER_REVIEW status.
   *
   * @param organizationId  Tenant scope.
   * @param appealId        Appeal ObjectId (hex string).
   * @param applicantId     JWT `sub` of the authenticated applicant.
   * @param dto             Optional withdrawal reason.
   */
  async withdrawAppeal(
    organizationId: string,
    appealId: string,
    applicantId: string,
    dto: WithdrawAppealDto,
  ): Promise<AppealResult> {
    const appeal = await this.findAppeal(organizationId, appealId);

    // Ownership guard.
    if (appeal.applicantId !== applicantId) {
      throw new ForbiddenDomainException(
        'Only the applicant who filed this appeal may withdraw it.',
        ErrorCode.BIZ_APPEAL_WITHDRAW_FORBIDDEN,
      );
    }

    // State guard.
    if (!ACTIVE_APPEAL_STATUSES.has(appeal.status)) {
      throw new BusinessRuleException(
        `Cannot withdraw an appeal with status '${appeal.status}'.`,
        ErrorCode.BIZ_APPEAL_INVALID_STATE,
      );
    }

    const now = new Date();
    appeal.status = AppealStatus.WITHDRAWN;
    appeal.withdrawalReason = dto.reason ?? null;
    appeal.withdrawnAt = now;
    appeal.resolvedAt = now;
    appeal.resolvedBy = applicantId;
    this.appendAudit(appeal, 'withdrawn', applicantId, undefined, {
      reason: dto.reason,
    });

    const saved = await appeal.save();
    return toApplicantResult(saved);
  }

  // ── Applicant: get own appeal ──────────────────────────────────────────────

  /**
   * Returns the applicant-facing view of an appeal.
   * The service verifies the authenticated caller is the applicant.
   *
   * @param organizationId  Tenant scope.
   * @param appealId        Appeal ObjectId (hex string).
   * @param applicantId     JWT `sub` of the authenticated applicant.
   */
  async getAppealForApplicant(
    organizationId: string,
    appealId: string,
    applicantId: string,
  ): Promise<AppealResult> {
    const appeal = await this.findAppeal(organizationId, appealId);
    if (appeal.applicantId !== applicantId) {
      throw new ForbiddenDomainException(
        'You do not have permission to view this appeal.',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    return toApplicantResult(appeal);
  }

  /**
   * Lists all appeals filed for a specific application (applicant view).
   * Verifies the caller is the application owner.
   *
   * @param organizationId  Tenant scope.
   * @param applicationId   Application ObjectId (hex string).
   * @param applicantId     JWT `sub` of the authenticated applicant.
   */
  async listAppealsForApplicant(
    organizationId: string,
    applicationId: string,
    applicantId: string,
  ): Promise<AppealResult[]> {
    const app = await this.resolveApplication(organizationId, applicationId);
    if (app.applicantId !== applicantId) {
      throw new ForbiddenDomainException(
        'You do not have permission to view appeals for this application.',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    const docs = await this.appealModel
      .find({
        organizationId,
        applicationId: new Types.ObjectId(applicationId),
      })
      .sort({ createdAt: -1 })
      .exec();
    return docs.map(toApplicantResult);
  }

  // ── Staff: assign reviewer ─────────────────────────────────────────────────

  /**
   * Staff (OWNER or ADMIN) assigns a reviewer to an appeal, transitioning
   * status from PENDING → UNDER_REVIEW.
   *
   * Rules:
   *   1. Appeal exists and is scoped to `organizationId`.
   *   2. Appeal must be in PENDING status.
   *   3. The proposed reviewer must not be in `excludedReviewerIds`.
   *
   * When `dto.assignedReviewerId` is omitted the calling staff member is
   * assigned (self-assignment).
   *
   * @param organizationId  Tenant scope.
   * @param appealId        Appeal ObjectId (hex string).
   * @param actorId         JWT `sub` of the staff member performing the assignment.
   * @param dto             Optional reviewerId override.
   */
  async assignAppeal(
    organizationId: string,
    appealId: string,
    actorId: string,
    dto: AssignAppealDto,
  ): Promise<AppealResult> {
    const appeal = await this.findAppeal(organizationId, appealId);

    // State guard: only PENDING appeals can be assigned.
    if (appeal.status !== AppealStatus.PENDING) {
      throw new BusinessRuleException(
        `Cannot assign a reviewer to an appeal with status '${appeal.status}'. ` +
          `Appeal must be in PENDING status.`,
        ErrorCode.BIZ_APPEAL_INVALID_STATE,
      );
    }

    const reviewerId = dto.assignedReviewerId ?? actorId;

    // Exclusion guard: reviewer must not be an original reviewer.
    if (appeal.excludedReviewerIds.includes(reviewerId)) {
      throw new BusinessRuleException(
        `Reviewer '${reviewerId}' was an original reviewer on this application ` +
          `and is excluded from reviewing the appeal.`,
        ErrorCode.BIZ_APPEAL_REVIEWER_EXCLUDED,
      );
    }

    const now = new Date();
    appeal.status = AppealStatus.UNDER_REVIEW;
    appeal.assignedReviewerId = reviewerId;
    appeal.assignedAt = now;
    this.appendAudit(appeal, 'ownership_taken', actorId, undefined, {
      assignedReviewerId: reviewerId,
    });

    const saved = await appeal.save();

    // Notify applicant that their appeal is now under review (best-effort).
    await this.notify(
      appeal.applicantId,
      'Your scholarship appeal is now under review',
      `Your appeal (id: ${appealId}) is being actively reviewed by our team.\n` +
        `You will be notified once a decision has been made.`,
    );

    return toResult(saved);
  }

  // ── Staff: resolve appeal ──────────────────────────────────────────────────

  /**
   * Staff records the final decision on an appeal (UPHELD or DISMISSED).
   *
   * Rules:
   *   1. Appeal exists and is scoped to `organizationId`.
   *   2. Appeal must be in UNDER_REVIEW status.
   *   3. `dto.resolution` must be UPHELD or DISMISSED.
   *   4. `dto.reason` is mandatory.
   *
   * When UPHELD:
   *   - The linked application status is transitioned back to UNDER_REVIEW
   *     so a fresh, unbiased review round can be opened.
   *
   * On success the applicant is notified (best-effort).
   *
   * @param organizationId  Tenant scope.
   * @param appealId        Appeal ObjectId (hex string).
   * @param actorId         JWT `sub` of the staff member resolving the appeal.
   * @param actorDisplayName Display name for the audit entry.
   * @param dto             Validated resolution body.
   */
  async resolveAppeal(
    organizationId: string,
    appealId: string,
    actorId: string,
    actorDisplayName: string,
    dto: ResolveAppealDto,
  ): Promise<AppealResult> {
    const appeal = await this.findAppeal(organizationId, appealId);

    // State guard.
    if (appeal.status !== AppealStatus.UNDER_REVIEW) {
      throw new BusinessRuleException(
        `Cannot resolve an appeal with status '${appeal.status}'. ` +
          `Appeal must be in UNDER_REVIEW status.`,
        ErrorCode.BIZ_APPEAL_INVALID_STATE,
      );
    }

    // Resolution value guard.
    if (
      dto.resolution !== AppealStatus.UPHELD &&
      dto.resolution !== AppealStatus.DISMISSED
    ) {
      throw new ValidationDomainException(
        `Invalid resolution '${dto.resolution}'. Must be '${AppealStatus.UPHELD}' ` +
          `or '${AppealStatus.DISMISSED}'.`,
        ErrorCode.BIZ_APPEAL_RESOLUTION_INVALID,
      );
    }

    const now = new Date();
    appeal.status = dto.resolution;
    appeal.resolvedAt = now;
    appeal.resolvedBy = actorId;
    appeal.resolutionReason = dto.reason;
    if (dto.reviewNotes !== undefined) {
      appeal.reviewNotes = dto.reviewNotes;
    }

    this.appendAudit(
      appeal,
      dto.resolution === AppealStatus.UPHELD ? 'upheld' : 'dismissed',
      actorId,
      actorDisplayName,
      { reason: dto.reason },
    );

    const saved = await appeal.save();

    // When upheld, return the application to UNDER_REVIEW for a fresh round.
    if (dto.resolution === AppealStatus.UPHELD) {
      await this.applicationModel
        .findOneAndUpdate(
          {
            _id: appeal.applicationId,
            organizationId,
          },
          {
            $set: {
              status: ScholarshipApplicationStatus.UNDER_REVIEW,
              decidedAt: null,
              decidedBy: null,
              decisionReason: null,
            },
          },
        )
        .exec();
    }

    // Notify applicant (best-effort).
    const outcomeText =
      dto.resolution === AppealStatus.UPHELD
        ? 'upheld — your application has been returned for a fresh review'
        : 'dismissed — the original decision stands';

    await this.notify(
      appeal.applicantId,
      `Decision on your scholarship appeal — ${dto.resolution.toUpperCase()}`,
      `Your appeal (id: ${appealId}) has been ${outcomeText}.\n\n` +
        `Decision: ${dto.resolution.toUpperCase()}\n` +
        `Reason: ${dto.reason}`,
    );

    return toResult(saved);
  }

  // ── Staff: read operations ─────────────────────────────────────────────────

  /**
   * Returns the full staff view of a single appeal.
   *
   * @param organizationId  Tenant scope.
   * @param appealId        Appeal ObjectId (hex string).
   */
  async getAppeal(
    organizationId: string,
    appealId: string,
  ): Promise<AppealResult> {
    const appeal = await this.findAppeal(organizationId, appealId);
    return toResult(appeal);
  }

  /**
   * Lists appeals for an application (staff view, includes all fields).
   *
   * @param organizationId  Tenant scope.
   * @param applicationId   Application ObjectId (hex string).
   * @param query           Optional status / grounds filters.
   */
  async listAppealsForApplication(
    organizationId: string,
    applicationId: string,
    query: ListAppealsQueryDto,
  ): Promise<AppealResult[]> {
    await this.resolveApplication(organizationId, applicationId);

    const filter: Record<string, unknown> = {
      organizationId,
      applicationId: new Types.ObjectId(applicationId),
    };
    if (query.status) filter.status = query.status;
    if (query.grounds) filter.grounds = query.grounds;

    const docs = await this.appealModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();

    return docs.map(toResult);
  }

  /**
   * Lists appeals across an entire program (staff view).
   *
   * @param organizationId  Tenant scope.
   * @param programId       Program ObjectId (hex string).
   * @param query           Optional status / grounds filters.
   */
  async listAppealsForProgram(
    organizationId: string,
    programId: string,
    query: ListAppealsQueryDto,
  ): Promise<AppealResult[]> {
    const filter: Record<string, unknown> = {
      organizationId,
      programId: new Types.ObjectId(programId),
    };
    if (query.status) filter.status = query.status;
    if (query.grounds) filter.grounds = query.grounds;

    const docs = await this.appealModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();

    return docs.map(toResult);
  }

  // ── Cron: deadline enforcement ─────────────────────────────────────────────

  /**
   * Hourly sweep — transitions PENDING appeals whose `resolutionDeadline`
   * has passed to EXPIRED.
   *
   * Design notes:
   *   - Uses `updateMany` for atomicity; does not load full documents.
   *   - Idempotent: running multiple times on the same set of appeals
   *     produces the same result (already-EXPIRED documents are not matched
   *     because the filter requires status PENDING or UNDER_REVIEW).
   *   - Only transitions PENDING appeals (UNDER_REVIEW ones have an assigned
   *     reviewer and should be escalated by a separate process, not silently
   *     expired; they are included in the filter so the cron also catches
   *     stalled UNDER_REVIEW appeals past deadline).
   *
   * @returns Number of appeals transitioned to EXPIRED in this run.
   */
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'scholarship-appeal-expiry',
  })
  async expireOverdueAppeals(): Promise<number> {
    const now = new Date();

    const result = await this.appealModel.updateMany(
      {
        status: { $in: [AppealStatus.PENDING, AppealStatus.UNDER_REVIEW] },
        resolutionDeadline: { $lt: now },
      },
      {
        $set: { status: AppealStatus.EXPIRED, resolvedAt: now },
        $push: {
          auditTrail: {
            action: 'expired',
            actorId: 'system',
            actorDisplayName: 'Scheduled expiry job',
            occurredAt: now,
            payload: {},
          },
        },
      },
    );

    const count = result.modifiedCount;
    if (count > 0) {
      this.logger.log(`Expired ${count} overdue appeal(s).`);
    }
    return count;
  }

  /**
   * Every-6-hours safety-net reconciliation run — catches any appeals
   * missed by the hourly job (e.g. due to a restart or transient error).
   *
   * Delegates to the same logic as the hourly job.
   */
  @Cron(CronExpression.EVERY_6_HOURS, {
    name: 'scholarship-appeal-expiry-reconciliation',
  })
  async reconcileExpiredAppeals(): Promise<number> {
    return this.expireOverdueAppeals();
  }
}
