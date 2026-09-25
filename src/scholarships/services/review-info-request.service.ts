import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ReviewInfoRequest,
  ReviewInfoRequestDocument,
  InfoRequestStatus,
} from '../schemas/review-info-request.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
  ScholarshipApplicationStatus,
} from '../schemas/scholarship-application.schema';
import {
  CancelInfoRequestDto,
  CreateInfoRequestDto,
  InfoRequestResult,
  InfoRequestScopeQueryDto,
  ListInfoRequestsQueryDto,
  SubmitInfoResponseDto,
} from '../dto/review-info-request.dto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { EmailService } from '../../email/email.service';

// ── Serialization helper ──────────────────────────────────────────────────────

/**
 * Maps a Mongoose document to the stable public API shape.
 * Called by every method that returns data to the controller layer.
 */
function toResult(doc: ReviewInfoRequestDocument): InfoRequestResult {
  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId,
    applicationId: doc.applicationId.toString(),
    programId: doc.programId.toString(),
    reviewerId: doc.reviewerId,
    applicantId: doc.applicantId,
    status: doc.status,
    questions: doc.questions.map((q) => ({
      id: q._id.toString(),
      questionKey: q.questionKey,
      text: q.text,
      required: q.required,
      hint: q.hint,
    })),
    deadline: doc.deadline.toISOString(),
    reviewerNote: doc.reviewerNote,
    responses: doc.responses.map((r) => ({
      id: r._id.toString(),
      version: r.version,
      answers: r.answers.map((a) => ({
        questionId: a.questionId.toString(),
        value: a.value,
      })),
      note: r.note,
      submittedBy: r.submittedBy,
      submittedAt: r.submittedAt.toISOString(),
    })),
    latestVersion: doc.responses.length,
    cancellationReason: doc.cancellationReason,
    cancelledAt: doc.cancelledAt?.toISOString(),
    expiredAt: doc.expiredAt?.toISOString(),
    createdAt: doc.createdAt!.toISOString(),
    updatedAt: doc.updatedAt!.toISOString(),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ReviewInfoRequestService {
  private readonly logger = new Logger(ReviewInfoRequestService.name);

  constructor(
    @InjectModel(ReviewInfoRequest.name)
    private readonly infoRequestModel: Model<ReviewInfoRequestDocument>,
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    private readonly emailService: EmailService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Loads the application document and asserts it belongs to the given
   * organization.  Throws ResourceNotFoundException otherwise.
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
   * Loads an info-request by id and asserts tenant ownership.
   * Throws ResourceNotFoundException if absent or mismatched.
   */
  private async resolveRequest(
    organizationId: string,
    requestId: string,
  ): Promise<ReviewInfoRequestDocument> {
    const req = await this.infoRequestModel.findById(requestId).exec();
    if (!req || req.organizationId !== organizationId) {
      throw new ResourceNotFoundException(
        'Info-request not found.',
        ErrorCode.RES_INFO_REQUEST_NOT_FOUND,
      );
    }
    return req;
  }

  /**
   * Fires an email notification, swallowing errors so that a notification
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
      // Log but do not re-throw — notification is best-effort.
      this.logger.warn(
        `Failed to send notification to ${to}: ${(err as Error).message}`,
      );
    }
  }

  // ── Write operations ───────────────────────────────────────────────────────

  /**
   * Creates a new info-request for an application.
   *
   * Rules (in order):
   *   1. Application exists and is scoped to organizationId.
   *   2. Application is in UNDER_REVIEW status.
   *   3. `questions` is non-empty (enforced by DTO, double-checked here).
   *   4. `questionKey` values are unique within the array.
   *   5. `deadline` is in the future.
   *
   * On success the applicant is notified via email (best-effort).
   *
   * @param organizationId  Tenant scope.
   * @param applicationId   Target application ObjectId (hex string).
   * @param reviewerId      JWT `sub` of the requesting reviewer.
   * @param dto             Validated request body.
   */
  async createRequest(
    organizationId: string,
    applicationId: string,
    reviewerId: string,
    dto: CreateInfoRequestDto,
  ): Promise<InfoRequestResult> {
    const app = await this.resolveApplication(organizationId, applicationId);

    if (app.status !== ScholarshipApplicationStatus.UNDER_REVIEW) {
      throw new BusinessRuleException(
        `Application must be in '${ScholarshipApplicationStatus.UNDER_REVIEW}' ` +
          `status to receive an info-request (current: '${app.status}').`,
        ErrorCode.BIZ_INFO_REQUEST_INVALID_STATE,
      );
    }

    // Guard: at least one question (belt-and-suspenders over DTO).
    if (!dto.questions || dto.questions.length === 0) {
      throw new ValidationDomainException(
        'At least one question is required.',
        ErrorCode.VAL_INFO_REQUEST_NO_QUESTIONS,
      );
    }

    // Guard: unique questionKey values within the request.
    const keys = dto.questions.map((q) => q.questionKey);
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      throw new ValidationDomainException(
        'Each questionKey must be unique within the request.',
        ErrorCode.VAL_INFO_REQUEST_NO_QUESTIONS,
      );
    }

    // Guard: deadline must be in the future.
    const deadline = new Date(dto.deadline);
    if (deadline <= new Date()) {
      throw new ValidationDomainException(
        'deadline must be a future date/time.',
        ErrorCode.VAL_INFO_REQUEST_DEADLINE_PAST,
      );
    }

    const questions = dto.questions.map((q) => ({
      questionKey: q.questionKey,
      text: q.text,
      required: q.required ?? true,
      hint: q.hint,
    }));

    const created = await this.infoRequestModel.create({
      organizationId,
      applicationId: app._id,
      programId: app.programId,
      reviewerId,
      applicantId: app.applicantId,
      status: InfoRequestStatus.OPEN,
      questions,
      deadline,
      reviewerNote: dto.reviewerNote,
      responses: [],
    });

    // Notify applicant (best-effort).
    await this.notify(
      app.applicantId,
      'Additional information requested for your scholarship application',
      `A reviewer has requested additional information for your application.\n` +
        `Please respond by ${deadline.toUTCString()}.\n\n` +
        (dto.reviewerNote ? `Reviewer note: ${dto.reviewerNote}\n\n` : '') +
        `Questions:\n` +
        questions
          .map((q, i) => `${i + 1}. ${q.text}${q.required ? ' (required)' : ' (optional)'}`)
          .join('\n'),
    );

    return toResult(created);
  }

  /**
   * Submits a versioned response to an open info-request.
   *
   * Rules (in order):
   *   1. Request exists and is scoped to organizationId.
   *   2. Request status is OPEN or RESPONDED (not CANCELLED or EXPIRED).
   *   3. Deadline has not passed.
   *   4. `applicantId` matches the authenticated caller (caller is the applicant).
   *   5. Every `questionId` in `answers` maps to a question on the request.
   *   6. No duplicate `questionId` entries.
   *   7. All required questions have a corresponding answer.
   *
   * A new `InfoRequestResponse` version is appended.  If this is the first
   * response, status transitions from OPEN → RESPONDED.
   *
   * On success the reviewer is notified (best-effort).
   *
   * @param organizationId  Tenant scope.
   * @param requestId       Info-request ObjectId (hex string).
   * @param applicantId     JWT `sub` of the responding applicant.
   * @param dto             Validated response body.
   */
  async submitResponse(
    organizationId: string,
    requestId: string,
    applicantId: string,
    dto: SubmitInfoResponseDto,
  ): Promise<InfoRequestResult> {
    const req = await this.resolveRequest(organizationId, requestId);

    // State guard: only OPEN or RESPONDED can accept new response versions.
    if (
      req.status === InfoRequestStatus.CANCELLED ||
      req.status === InfoRequestStatus.EXPIRED
    ) {
      throw new BusinessRuleException(
        `Cannot submit a response to a request with status '${req.status}'.`,
        ErrorCode.BIZ_INFO_REQUEST_INVALID_STATE,
      );
    }

    // Deadline guard.
    if (new Date() > req.deadline) {
      throw new BusinessRuleException(
        'The response deadline for this info-request has passed.',
        ErrorCode.BIZ_INFO_REQUEST_DEADLINE_PASSED,
      );
    }

    // Ownership guard: only the applicant who owns the application may respond.
    if (req.applicantId !== applicantId) {
      throw new ForbiddenDomainException(
        'Only the applicant who owns this application may respond to an info-request.',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    // Build a map of questionId → question for O(1) lookups.
    const questionMap = new Map(
      req.questions.map((q) => [q._id.toString(), q]),
    );

    // Guard: no unknown questionId references.
    for (const answer of dto.answers) {
      if (!questionMap.has(answer.questionId)) {
        throw new ValidationDomainException(
          `answers contains unknown questionId '${answer.questionId}'.`,
          ErrorCode.VAL_INFO_REQUEST_UNKNOWN_QUESTION,
        );
      }
    }

    // Guard: no duplicate questionId in this submission.
    const answeredIds = dto.answers.map((a) => a.questionId);
    if (new Set(answeredIds).size !== answeredIds.length) {
      throw new ValidationDomainException(
        'Duplicate questionId entries are not allowed in a single response.',
        ErrorCode.VAL_INFO_REQUEST_UNKNOWN_QUESTION,
      );
    }

    // Guard: all required questions must be answered.
    const answeredSet = new Set(answeredIds);
    for (const [qId, q] of questionMap) {
      if (q.required && !answeredSet.has(qId)) {
        throw new ValidationDomainException(
          `Required question '${q.questionKey}' (id: ${qId}) was not answered.`,
          ErrorCode.VAL_INFO_REQUEST_REQUIRED_ANSWER_MISSING,
        );
      }
    }

    const nextVersion = req.responses.length + 1;
    const now = new Date();

    const newResponse = {
      version: nextVersion,
      answers: dto.answers.map((a) => ({
        questionId: new Types.ObjectId(a.questionId),
        value: a.value,
      })),
      note: dto.note,
      submittedBy: applicantId,
      submittedAt: now,
    };

    // Append the new response version and update status if needed.
    const updatedStatus =
      req.status === InfoRequestStatus.OPEN
        ? InfoRequestStatus.RESPONDED
        : req.status;

    req.responses.push(newResponse as any);
    req.status = updatedStatus;
    const saved = await req.save();

    // Notify reviewer (best-effort).
    await this.notify(
      req.reviewerId,
      `Applicant responded to info-request (version ${nextVersion})`,
      `The applicant has submitted response version ${nextVersion} for info-request ${requestId}.\n` +
        `Application: ${req.applicationId.toString()}\n` +
        (dto.note ? `Note: ${dto.note}` : ''),
    );

    return toResult(saved);
  }

  /**
   * Cancels an open info-request.
   *
   * Rules:
   *   1. Request exists and is scoped to organizationId.
   *   2. Only the reviewer who created the request may cancel it.
   *   3. Request must be in OPEN or RESPONDED status.
   *
   * On success the applicant is notified (best-effort).
   *
   * @param organizationId  Tenant scope.
   * @param requestId       Info-request ObjectId (hex string).
   * @param reviewerId      JWT `sub` of the cancelling reviewer.
   * @param dto             Optional cancellation reason.
   */
  async cancelRequest(
    organizationId: string,
    requestId: string,
    reviewerId: string,
    dto: CancelInfoRequestDto,
  ): Promise<InfoRequestResult> {
    const req = await this.resolveRequest(organizationId, requestId);

    // Ownership: only the creating reviewer may cancel.
    if (req.reviewerId !== reviewerId) {
      throw new ForbiddenDomainException(
        'Only the reviewer who created this info-request may cancel it.',
        ErrorCode.BIZ_INFO_REQUEST_CANCEL_FORBIDDEN,
      );
    }

    // State guard: CANCELLED and EXPIRED requests cannot be cancelled again.
    if (
      req.status === InfoRequestStatus.CANCELLED ||
      req.status === InfoRequestStatus.EXPIRED
    ) {
      throw new BusinessRuleException(
        `Cannot cancel a request with status '${req.status}'.`,
        ErrorCode.BIZ_INFO_REQUEST_INVALID_STATE,
      );
    }

    const now = new Date();
    req.status = InfoRequestStatus.CANCELLED;
    req.cancellationReason = dto.reason;
    req.cancelledAt = now;
    const saved = await req.save();

    // Notify applicant (best-effort).
    await this.notify(
      req.applicantId,
      'An information request for your scholarship application has been cancelled',
      `The reviewer has cancelled the info-request for your application.\n` +
        (dto.reason ? `Reason: ${dto.reason}` : ''),
    );

    return toResult(saved);
  }

  // ── Read operations ────────────────────────────────────────────────────────

  /**
   * Lists info-requests for a given application, optionally filtered by status.
   *
   * @param organizationId  Tenant scope.
   * @param applicationId   Target application ObjectId (hex string).
   * @param query           Optional status filter.
   */
  async listRequests(
    organizationId: string,
    applicationId: string,
    query: ListInfoRequestsQueryDto,
  ): Promise<InfoRequestResult[]> {
    // Confirm the application belongs to this org.
    await this.resolveApplication(organizationId, applicationId);

    const filter: Record<string, unknown> = {
      organizationId,
      applicationId: new Types.ObjectId(applicationId),
    };
    if (query.status) {
      filter.status = query.status;
    }

    const docs = await this.infoRequestModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();

    return docs.map(toResult);
  }

  /**
   * Fetches a single info-request by its id, scoped to the organization.
   *
   * @param organizationId  Tenant scope.
   * @param requestId       Info-request ObjectId (hex string).
   * @param _scope          (unused, kept for interface symmetry with other services)
   */
  async getRequest(
    organizationId: string,
    requestId: string,
  ): Promise<InfoRequestResult> {
    const req = await this.resolveRequest(organizationId, requestId);
    return toResult(req);
  }

  // ── Deadline enforcement ───────────────────────────────────────────────────

  /**
   * Scans all OPEN requests whose deadline has passed and transitions them
   * to EXPIRED.
   *
   * Intended to be called by a scheduled job (e.g. a Cron task or Bull
   * processor).  The method is idempotent: running it multiple times on the
   * same set of requests produces the same result.
   *
   * Notifications:
   *   Each newly expired request triggers a best-effort email to the reviewer
   *   informing them that the applicant did not respond in time.
   *
   * @returns Number of requests that were transitioned to EXPIRED in this run.
   */
  async expireOverdueRequests(): Promise<number> {
    const now = new Date();

    // Fetch in batches to avoid loading an unbounded number of documents.
    const overdueRequests = await this.infoRequestModel
      .find({
        status: InfoRequestStatus.OPEN,
        deadline: { $lt: now },
      })
      .exec();

    if (overdueRequests.length === 0) return 0;

    const ids = overdueRequests.map((r) => r._id);

    await this.infoRequestModel.updateMany(
      { _id: { $in: ids } },
      { $set: { status: InfoRequestStatus.EXPIRED, expiredAt: now } },
    );

    this.logger.log(
      `Expired ${overdueRequests.length} overdue info-request(s).`,
    );

    // Notify reviewers (best-effort, fire-and-forget).
    for (const req of overdueRequests) {
      await this.notify(
        req.reviewerId,
        'Info-request expired — applicant did not respond in time',
        `The applicant did not respond to your info-request (id: ${req._id.toString()}) ` +
          `before the deadline of ${req.deadline.toUTCString()}.\n` +
          `Application: ${req.applicationId.toString()}`,
      );
    }

    return overdueRequests.length;
  }
}
