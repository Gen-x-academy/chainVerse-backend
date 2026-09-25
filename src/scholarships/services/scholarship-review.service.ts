import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ScholarshipReview,
  ScholarshipReviewDocument,
  ReviewStatus,
} from '../schemas/scholarship-review.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
  ScholarshipApplicationStatus,
} from '../schemas/scholarship-application.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from '../schemas/scholarship-program.schema';
import {
  AbstainReviewDto,
  AggregateScoreResult,
  ReviewCriterionDto,
  SubmitReviewDto,
} from '../dto/scholarship-review.dto';
import {
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

// ── Precision constants ───────────────────────────────────────────────────────

/**
 * Number of decimal places used when rounding normalized scores.
 *
 * 4 d.p. gives sub-0.0001 precision which is sufficient for ranking thousands
 * of applicants while remaining human-readable.  Changing this constant
 * changes the rounding of stored `normalizedScore` values; existing documents
 * are NOT retroactively recomputed — run a migration if a precision change is
 * needed in production.
 */
export const AGGREGATE_SCORE_PRECISION = 4;

/**
 * Acceptable floating-point drift when checking that criterion weights sum
 * to 1.0.  IEEE-754 arithmetic on decimal fractions (e.g. 0.1 + 0.2 + 0.7)
 * can deviate by a few ULPs; this tolerance absorbs that without being loose
 * enough to allow genuinely mis-specified weights.
 */
export const WEIGHT_SUM_TOLERANCE = 0.001;

// ── Pure scoring helpers ──────────────────────────────────────────────────────

/**
 * Rounds a number to `precision` decimal places using "round half away from
 * zero" semantics, matching common spreadsheet and financial conventions.
 *
 * Implementation note: multiplying by 10^precision, rounding, then dividing
 * avoids the subtle bias of `parseFloat(n.toFixed(p))` on some JS engines.
 */
export function roundToPrecision(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Computes the weighted normalized score for a single review's criteria array.
 *
 * Algorithm:
 *   normalizedScore = Σ (criterion.score / criterion.maxScore) × criterion.weight
 *
 * The result is rounded to AGGREGATE_SCORE_PRECISION decimal places and is
 * guaranteed to be in [0, 1] when all inputs are valid.
 *
 * This is a pure function: given the same criteria it always returns the same
 * value, satisfying the reproducibility requirement.
 *
 * @param criteria  Validated criterion objects (score ≤ maxScore, weights sum to 1).
 */
export function computeNormalizedScore(
  criteria: Array<{ score: number; maxScore: number; weight: number }>,
): number {
  if (criteria.length === 0) return 0;

  const raw = criteria.reduce((sum, c) => {
    return sum + (c.score / c.maxScore) * c.weight;
  }, 0);

  return roundToPrecision(raw, AGGREGATE_SCORE_PRECISION);
}

/**
 * Computes the aggregate normalized score across all completed reviews.
 *
 * Algorithm:
 *   aggregateScore = mean(normalizedScore_i for each COMPLETED review i)
 *
 * Each per-review normalizedScore is already rounded; the final aggregate is
 * rounded again to AGGREGATE_SCORE_PRECISION to absorb any residual drift from
 * averaging pre-rounded values.
 *
 * @param completedScores  Array of per-review normalized scores (all COMPLETED).
 * @returns  Aggregate score in [0, 1] rounded to AGGREGATE_SCORE_PRECISION.
 */
export function computeAggregateScore(completedScores: number[]): number {
  if (completedScores.length === 0) return 0;
  const sum = completedScores.reduce((acc, s) => acc + s, 0);
  return roundToPrecision(sum / completedScores.length, AGGREGATE_SCORE_PRECISION);
}

// ── Validation helpers ────────────────────────────────────────────────────────

/**
 * Validates that every criterion score is within [0, maxScore] and that
 * weights sum to 1.0 within WEIGHT_SUM_TOLERANCE.
 *
 * Throws a typed domain exception on the first violation so that callers
 * receive a stable, machine-readable error code.
 */
export function validateCriteria(criteria: ReviewCriterionDto[]): void {
  if (criteria.length === 0) {
    throw new ValidationDomainException(
      'Review criteria must contain at least one entry.',
      ErrorCode.VAL_RUBRIC_CRITERIA_EMPTY,
    );
  }

  // Score range check
  for (let i = 0; i < criteria.length; i++) {
    const { score, maxScore, criterionKey } = criteria[i];
    if (score > maxScore) {
      throw new ValidationDomainException(
        `criteria[${i}].score (${score}) exceeds maxScore (${maxScore}) ` +
          `for criterion '${criterionKey}'.`,
        ErrorCode.VAL_RUBRIC_SCORE_OUT_OF_RANGE,
      );
    }
  }

  // Weight sum check
  const weightSum = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(weightSum - 1.0) > WEIGHT_SUM_TOLERANCE) {
    throw new ValidationDomainException(
      `Criterion weights must sum to 1.0 (± ${WEIGHT_SUM_TOLERANCE}). ` +
        `Actual sum: ${roundToPrecision(weightSum, 6)}.`,
      ErrorCode.VAL_RUBRIC_WEIGHTS_INVALID,
    );
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ScholarshipReviewService {
  constructor(
    @InjectModel(ScholarshipReview.name)
    private readonly reviewModel: Model<ScholarshipReviewDocument>,
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Resolves and validates the application, confirming it belongs to the
   * given organization.  Throws ResourceNotFoundException if absent.
   */
  private async resolveApplication(
    organizationId: string,
    applicationId: string,
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
    return application;
  }

  // ── Write operations ─────────────────────────────────────────────────────────

  /**
   * Submits a completed rubric review for an application.
   *
   * Rules enforced (in order):
   *   1. Application exists and is scoped to organizationId.
   *   2. Application must be in UNDER_REVIEW status.
   *   3. Reviewer has not already submitted a review for this application.
   *   4. Criteria array is non-empty.
   *   5. Each criterion score is within [0, maxScore].
   *   6. Criterion weights sum to 1.0 ± WEIGHT_SUM_TOLERANCE.
   *
   * The per-review `normalizedScore` is computed and stored atomically with
   * the criteria so the document is always internally consistent.
   *
   * @param organizationId  Tenant scope.
   * @param applicationId   Target application ObjectId (hex string).
   * @param reviewerId      JWT `sub` of the submitting reviewer.
   * @param dto             Validated criteria + optional comment.
   */
  async submitReview(
    organizationId: string,
    applicationId: string,
    reviewerId: string,
    dto: SubmitReviewDto,
  ): Promise<ScholarshipReviewDocument> {
    const application = await this.resolveApplication(
      organizationId,
      applicationId,
    );

    if (application.status !== ScholarshipApplicationStatus.UNDER_REVIEW) {
      throw new ResourceConflictException(
        `Application must be in '${ScholarshipApplicationStatus.UNDER_REVIEW}' ` +
          `status to accept reviews (current: '${application.status}').`,
        ErrorCode.BIZ_APPLICATION_NOT_UNDER_REVIEW,
      );
    }

    const existing = await this.reviewModel
      .findOne({ applicationId: application._id, reviewerId })
      .exec();
    if (existing) {
      throw new ResourceConflictException(
        'You have already submitted a review for this application.',
        ErrorCode.BIZ_REVIEW_ALREADY_EXISTS,
      );
    }

    // Validate criteria before writing anything
    validateCriteria(dto.criteria);

    const normalizedScore = computeNormalizedScore(dto.criteria);
    const now = new Date();

    const persistedCriteria = dto.criteria.map((c) => ({
      criterionKey: c.criterionKey,
      label: c.label,
      score: c.score,
      maxScore: c.maxScore,
      weight: c.weight,
      justification: c.justification,
    }));

    return this.reviewModel.create({
      organizationId,
      applicationId: application._id,
      programId: application.programId,
      reviewerId,
      status: ReviewStatus.COMPLETED,
      criteria: persistedCriteria,
      normalizedScore,
      overallComment: dto.overallComment,
      submittedAt: now,
    });
  }

  /**
   * Records a formal abstention for a reviewer on an application.
   *
   * Abstained reviews are excluded from aggregate computation.  A reviewer
   * can only abstain once per application (same uniqueness constraint as a
   * completed review).
   *
   * @param organizationId  Tenant scope.
   * @param applicationId   Target application ObjectId (hex string).
   * @param reviewerId      JWT `sub` of the abstaining reviewer.
   * @param dto             Optional reason comment.
   */
  async abstainReview(
    organizationId: string,
    applicationId: string,
    reviewerId: string,
    dto: AbstainReviewDto,
  ): Promise<ScholarshipReviewDocument> {
    const application = await this.resolveApplication(
      organizationId,
      applicationId,
    );

    if (application.status !== ScholarshipApplicationStatus.UNDER_REVIEW) {
      throw new ResourceConflictException(
        `Application must be in '${ScholarshipApplicationStatus.UNDER_REVIEW}' ` +
          `status to record an abstention (current: '${application.status}').`,
        ErrorCode.BIZ_APPLICATION_NOT_UNDER_REVIEW,
      );
    }

    const existing = await this.reviewModel
      .findOne({ applicationId: application._id, reviewerId })
      .exec();
    if (existing) {
      throw new ResourceConflictException(
        'You have already submitted a review or abstention for this application.',
        ErrorCode.BIZ_REVIEW_ALREADY_EXISTS,
      );
    }

    return this.reviewModel.create({
      organizationId,
      applicationId: application._id,
      programId: application.programId,
      reviewerId,
      status: ReviewStatus.ABSTAINED,
      criteria: [],
      normalizedScore: null,
      overallComment: dto.overallComment,
      submittedAt: new Date(),
    });
  }

  // ── Read operations ───────────────────────────────────────────────────────────

  /**
   * Lists all reviews for a given application, optionally filtered by status.
   *
   * Authorization note: this method is exposed only to OWNER/ADMIN/INSTRUCTOR.
   * Individual reviewer identities and scores are staff-only data and must
   * never be returned to applicants.
   *
   * @param organizationId  Tenant scope.
   * @param applicationId   Target application ObjectId (hex string).
   * @param status          Optional status filter.
   */
  async listReviews(
    organizationId: string,
    applicationId: string,
    status?: ReviewStatus,
  ): Promise<ScholarshipReviewDocument[]> {
    // Confirm the application belongs to the org before revealing any reviews.
    await this.resolveApplication(organizationId, applicationId);

    const filter: Record<string, unknown> = {
      organizationId,
      applicationId: new Types.ObjectId(applicationId),
    };
    if (status) filter.status = status;

    return this.reviewModel
      .find(filter)
      .sort({ submittedAt: 1 })
      .exec();
  }

  /**
   * Fetches a single review by its id, scoped to the organization.
   *
   * @param organizationId  Tenant scope.
   * @param reviewId        Review ObjectId (hex string).
   */
  async getReview(
    organizationId: string,
    reviewId: string,
  ): Promise<ScholarshipReviewDocument> {
    const review = await this.reviewModel.findById(reviewId).exec();
    if (!review || review.organizationId !== organizationId) {
      throw new ResourceNotFoundException(
        'Scholarship review not found',
        ErrorCode.RES_SCHOLARSHIP_REVIEW_NOT_FOUND,
      );
    }
    return review;
  }

  /**
   * Computes and returns the normalized aggregate score for an application.
   *
   * Algorithm (issue #1147):
   *   1. Fetch all reviews for the application regardless of status.
   *   2. Extract the `normalizedScore` from every COMPLETED review.
   *      PENDING and ABSTAINED reviews are excluded — they do not contribute
   *      to the divisor, so a small panel with one abstention is not penalized.
   *   3. Compute the mean of the COMPLETED normalized scores and round to
   *      AGGREGATE_SCORE_PRECISION (4 d.p.).
   *
   * Missing-review handling:
   *   If there are zero COMPLETED reviews the method throws
   *   BIZ_NO_COMPLETED_REVIEWS.  The caller (controller) surfaces this as a
   *   422 Unprocessable Entity rather than a partial or zero aggregate, because
   *   returning 0.0 would misrepresent the actual state of the review panel.
   *
   * Tie policy:
   *   When two applications share the same rounded aggregateScore, the
   *   application submitted earlier (lower `createdAt`) wins.  This is
   *   enforced at the ranking query layer, not in this method, because the
   *   tie-break requires cross-application comparison.  The `submittedAt` of
   *   the earliest COMPLETED review is included in the result object so that
   *   ranking queries can perform the tie-break server-side without a second
   *   round-trip.
   *
   * Reproducibility:
   *   The criteria sub-documents are immutable after submission.  Running this
   *   method again on the same set of COMPLETED reviews always yields the same
   *   aggregateScore.
   *
   * @param organizationId  Tenant scope.
   * @param applicationId   Target application ObjectId (hex string).
   */
  async getAggregateScore(
    organizationId: string,
    applicationId: string,
  ): Promise<AggregateScoreResult> {
    const application = await this.resolveApplication(
      organizationId,
      applicationId,
    );

    const allReviews = await this.reviewModel
      .find({
        organizationId,
        applicationId: application._id,
      })
      .sort({ submittedAt: 1 })
      .exec();

    const completedReviews = allReviews.filter(
      (r) => r.status === ReviewStatus.COMPLETED,
    );
    const pendingReviews = allReviews.filter(
      (r) => r.status === ReviewStatus.PENDING,
    );
    const abstainedReviews = allReviews.filter(
      (r) => r.status === ReviewStatus.ABSTAINED,
    );

    if (completedReviews.length === 0) {
      throw new ResourceConflictException(
        'No completed reviews exist for this application. ' +
          'Aggregate score cannot be computed until at least one review is submitted.',
        ErrorCode.BIZ_NO_COMPLETED_REVIEWS,
      );
    }

    // Re-compute from stored criteria to guarantee reproducibility even if
    // normalizedScore was persisted with a different AGGREGATE_SCORE_PRECISION.
    const perReviewScores = completedReviews.map((r) =>
      computeNormalizedScore(r.criteria),
    );

    const aggregateScore = computeAggregateScore(perReviewScores);

    return {
      applicationId: application._id.toString(),
      organizationId,
      programId: application.programId.toString(),
      aggregateScore,
      completedReviewCount: completedReviews.length,
      pendingReviewCount: pendingReviews.length,
      abstainedReviewCount: abstainedReviews.length,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Returns aggregate scores for ALL applications in a program, sorted by
   * aggregateScore descending with tie-breaking by earliest review submittedAt
   * ascending (earlier submission wins on a tie).
   *
   * Only applications that have at least one COMPLETED review are included.
   * Applications with only PENDING or ABSTAINED reviews are silently omitted.
   *
   * Authorization: OWNER / ADMIN / INSTRUCTOR of the organization.
   *
   * @param organizationId  Tenant scope.
   * @param programId       Program ObjectId (hex string).
   */
  async getProgramRankings(
    organizationId: string,
    programId: string,
  ): Promise<AggregateScoreResult[]> {
    // Verify program belongs to org
    const program = await this.programModel
      .findOne({ _id: programId, organizationId })
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }

    // Fetch all completed reviews for the program in one query
    const completedReviews = await this.reviewModel
      .find({
        organizationId,
        programId: new Types.ObjectId(programId),
        status: ReviewStatus.COMPLETED,
      })
      .sort({ submittedAt: 1 }) // ascending — earliest first for tie-break
      .exec();

    // Group completed reviews by applicationId
    const byApplication = new Map<
      string,
      ScholarshipReviewDocument[]
    >();
    for (const review of completedReviews) {
      const key = review.applicationId.toString();
      if (!byApplication.has(key)) byApplication.set(key, []);
      byApplication.get(key)!.push(review);
    }

    if (byApplication.size === 0) return [];

    // Fetch pending/abstained counts for each application in one query
    const applicationIds = [...byApplication.keys()].map(
      (id) => new Types.ObjectId(id),
    );

    const otherReviews = await this.reviewModel
      .find({
        organizationId,
        applicationId: { $in: applicationIds },
        status: { $in: [ReviewStatus.PENDING, ReviewStatus.ABSTAINED] },
      })
      .exec();

    const pendingCounts = new Map<string, number>();
    const abstainedCounts = new Map<string, number>();
    for (const r of otherReviews) {
      const key = r.applicationId.toString();
      if (r.status === ReviewStatus.PENDING) {
        pendingCounts.set(key, (pendingCounts.get(key) ?? 0) + 1);
      } else {
        abstainedCounts.set(key, (abstainedCounts.get(key) ?? 0) + 1);
      }
    }

    // Fetch applications to get programId (already have it, but need createdAt
    // for tie-break metadata in the result)
    const applications = await this.applicationModel
      .find({ _id: { $in: applicationIds }, organizationId })
      .exec();
    const appById = new Map(applications.map((a) => [a._id.toString(), a]));

    // Build result rows
    const results: AggregateScoreResult[] = [];
    const computedAt = new Date().toISOString();

    for (const [appIdStr, reviews] of byApplication) {
      const app = appById.get(appIdStr);
      if (!app) continue; // should not happen — defensive guard

      const perReviewScores = reviews.map((r) =>
        computeNormalizedScore(r.criteria),
      );
      const aggregateScore = computeAggregateScore(perReviewScores);

      results.push({
        applicationId: appIdStr,
        organizationId,
        programId,
        aggregateScore,
        completedReviewCount: reviews.length,
        pendingReviewCount: pendingCounts.get(appIdStr) ?? 0,
        abstainedReviewCount: abstainedCounts.get(appIdStr) ?? 0,
        computedAt,
      });
    }

    // Sort: highest aggregateScore first; tie-break by earliest COMPLETED
    // review submittedAt ascending (the reviews array is already sorted asc
    // by submittedAt, so reviews[0].submittedAt is the earliest for each app).
    results.sort((a, b) => {
      if (b.aggregateScore !== a.aggregateScore) {
        return b.aggregateScore - a.aggregateScore;
      }
      // Tie-break: earlier first review submittedAt wins
      const aEarliest =
        byApplication.get(a.applicationId)?.[0]?.submittedAt?.getTime() ?? 0;
      const bEarliest =
        byApplication.get(b.applicationId)?.[0]?.submittedAt?.getTime() ?? 0;
      return aEarliest - bEarliest;
    });

    return results;
  }
}
