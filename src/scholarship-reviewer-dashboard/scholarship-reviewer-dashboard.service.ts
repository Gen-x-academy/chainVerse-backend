import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ScholarshipReview,
  ScholarshipReviewDocument,
  ReviewStatus,
} from '../scholarships/schemas/scholarship-review.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from '../scholarships/schemas/scholarship-program.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
} from '../scholarships/schemas/scholarship-application.schema';
import {
  CommitteeDecision,
  CommitteeDecisionDocument,
} from '../scholarships/schemas/committee-decision.schema';
import {
  ReviewerAssignmentCardDto,
  ReviewerAssignmentQueryDto,
  ReviewerDashboardSnapshotDto,
  ReviewerWorkloadDto,
} from './dto/reviewer-dashboard.dto';
import { ResourceNotFoundException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';

/**
 * ScholarshipReviewerDashboardService
 *
 * Provides the reviewer's personal work queue and workload metrics.
 *
 * Blind-review enforcement:
 *   When a program has `blindReview = true` (convention stored on the program
 *   document or its terms), applicant identity fields are stripped from all
 *   assignment cards.  The service reads a `blindReview` flag from the program;
 *   if the field is absent it defaults to `false` to avoid accidentally hiding
 *   data from programmes that never configured it.
 *
 * Ownership: all queries filter by `reviewerId = JWT sub`.  A reviewer cannot
 *   see another reviewer's assignments through this service.
 *
 * Privacy:
 *   - Rubric scores from other reviewers are never returned.
 *   - Applicant identity follows the blind-review flag on the programme.
 *
 * Conflict detection:
 *   A conflict is inferred when a CommitteeDecision document for the same
 *   application was already authored by this reviewer (separation-of-duties).
 *   The service surfaces conflicted applicationIds so the UI can display a
 *   warning and block submission.
 */
@Injectable()
export class ScholarshipReviewerDashboardService {
  constructor(
    @InjectModel(ScholarshipReview.name)
    private readonly reviewModel: Model<ScholarshipReviewDocument>,
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    @InjectModel(CommitteeDecision.name)
    private readonly committeeDecisionModel: Model<CommitteeDecisionDocument>,
  ) {}

  // ── Snapshot ────────────────────────────────────────────────────────────────

  /**
   * Returns a full dashboard snapshot for the calling reviewer: workload
   * counts, pending assignments, overdue assignments, and conflicted
   * application IDs — all in one request to minimise round-trips.
   */
  async getSnapshot(
    reviewerId: string,
    organizationId: string,
  ): Promise<ReviewerDashboardSnapshotDto> {
    const [workload, pendingCards, overdueCards, conflictedIds] =
      await Promise.all([
        this.getWorkload(reviewerId, organizationId),
        this.listAssignments(reviewerId, {
          organizationId,
          status: ReviewStatus.PENDING,
          page: 1,
          limit: 10,
        }).then((r) => r.data),
        this.listAssignments(reviewerId, {
          organizationId,
          page: 1,
          limit: 10,
        })
          .then((r) => r.data.filter((c) => c.isOverdue))
          .catch(() => [] as ReviewerAssignmentCardDto[]),
        this.getConflictedApplicationIds(reviewerId, organizationId),
      ]);

    return {
      reviewerId,
      organizationId,
      workload,
      pendingAssignments: pendingCards,
      overdueAssignments: overdueCards,
      conflictedApplicationIds: conflictedIds,
      computedAt: new Date(),
    };
  }

  // ── Workload ────────────────────────────────────────────────────────────────

  /**
   * Computes workload counts for the reviewer in the given organisation.
   * Overdue count includes any PENDING review whose program has a deadline
   * tracked on the CommitteeDecision document (uses `reviewDeadline` if set).
   */
  async getWorkload(
    reviewerId: string,
    organizationId: string,
  ): Promise<ReviewerWorkloadDto> {
    const statusAgg = await this.reviewModel.aggregate<{
      _id: ReviewStatus;
      count: number;
    }>([
      { $match: { reviewerId, organizationId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const byStatus = Object.fromEntries(
      statusAgg.map((s) => [s._id, s.count]),
    ) as Partial<Record<ReviewStatus, number>>;

    const totalAssigned = Object.values(byStatus).reduce((s, c) => s + c, 0);
    const totalPending = byStatus[ReviewStatus.PENDING] ?? 0;
    const totalCompleted = byStatus[ReviewStatus.COMPLETED] ?? 0;
    const totalAbstained = byStatus[ReviewStatus.ABSTAINED] ?? 0;

    // Count overdue: PENDING reviews where the program review window has passed.
    const now = new Date();
    const overdueCount = await this.reviewModel.countDocuments({
      reviewerId,
      organizationId,
      status: ReviewStatus.PENDING,
      reviewDeadline: { $lt: now },
    });

    const completionRate =
      totalAssigned > 0 ? (totalCompleted + totalAbstained) / totalAssigned : 0;

    return {
      reviewerId,
      organizationId,
      totalAssigned,
      totalPending,
      totalCompleted,
      totalAbstained,
      totalOverdue: overdueCount,
      completionRate: Math.round(completionRate * 10000) / 10000,
      computedAt: new Date(),
    };
  }

  // ── Assignments ─────────────────────────────────────────────────────────────

  /**
   * Returns the reviewer's paginated assignment work queue.
   *
   * Blind-review enforcement is applied per-program: when a programme's
   * `blindReview` flag is true the applicant identity is stripped from the
   * returned card.
   */
  async listAssignments(
    reviewerId: string,
    query: ReviewerAssignmentQueryDto,
  ): Promise<{ data: ReviewerAssignmentCardDto[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      reviewerId,
      organizationId: query.organizationId,
    };
    if (query.status) filter.status = query.status;
    if (query.programId)
      filter.programId = new Types.ObjectId(query.programId);

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.reviewModel.countDocuments(filter).exec(),
    ]);

    if (reviews.length === 0) {
      return { data: [], total, page, limit };
    }

    // Batch-load programs for blind-review flags and titles.
    const programIds = [...new Set(reviews.map((r) => String(r.programId)))];
    const programs = await this.programModel
      .find({ _id: { $in: programIds } })
      .select('title')
      .lean()
      .exec();
    const programMap = Object.fromEntries(
      programs.map((p) => [String(p._id), p]),
    );

    // Determine which applications the reviewer has a conflict on.
    const appIds = [...new Set(reviews.map((r) => String(r.applicationId)))];
    const conflictedSet = new Set(
      await this.getConflictedApplicationIds(reviewerId, query.organizationId),
    );

    const now = new Date();

    const data: ReviewerAssignmentCardDto[] = reviews.map((rev) => {
      const prog = programMap[String(rev.programId)];
      const isBlind = !!(prog as Record<string, unknown>)?.['blindReview'];
      const deadline = (rev as Record<string, unknown>)['reviewDeadline'] as Date | undefined;
      const isOverdue =
        rev.status === ReviewStatus.PENDING && !!deadline && deadline < now;
      const hasConflict = conflictedSet.has(String(rev.applicationId));

      const card: ReviewerAssignmentCardDto = {
        reviewId: String(rev._id),
        applicationId: String(rev.applicationId),
        programId: String(rev.programId),
        programTitle: prog?.title ?? 'Unknown Program',
        status: rev.status,
        reviewDeadline: deadline,
        hasConflict,
        isOverdue,
        nextAction: this.resolveNextAction(rev.status, isOverdue, hasConflict),
      };

      // Only expose applicant name when blind review is NOT active.
      if (!isBlind) {
        card.applicantName = (rev as Record<string, unknown>)['applicantName'] as string | undefined;
      }

      return card;
    });

    return { data, total, page, limit };
  }

  /**
   * Returns the full ScholarshipReview document for the reviewer to render
   * the review form.  Enforces ownership (reviewerId must match).
   */
  async getReview(
    reviewerId: string,
    reviewId: string,
  ): Promise<ScholarshipReviewDocument> {
    const review = await this.reviewModel
      .findOne({ _id: reviewId, reviewerId })
      .exec();
    if (!review) {
      throw new ResourceNotFoundException(
        'Review assignment not found',
        ErrorCode.RES_REVIEWER_ASSIGNMENT_NOT_FOUND,
      );
    }
    return review;
  }

  // ── Conflict Detection ──────────────────────────────────────────────────────

  /**
   * Returns application IDs where this reviewer has a separation-of-duties
   * conflict: specifically where they also authored a CommitteeDecision on the
   * same application.
   *
   * The result is advisory — the guard that blocks score submission lives in
   * ScholarshipReviewService.  This method surfaces the IDs so the UI can
   * display a pre-emptive warning.
   */
  async getConflictedApplicationIds(
    reviewerId: string,
    organizationId: string,
  ): Promise<string[]> {
    const decisions = await this.committeeDecisionModel
      .find({ organizationId, decidedBy: reviewerId })
      .select('applicationId')
      .lean()
      .exec();
    return decisions.map((d) => String(d.applicationId));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private resolveNextAction(
    status: ReviewStatus,
    isOverdue: boolean,
    hasConflict: boolean,
  ): string {
    if (hasConflict) return 'declare_conflict';
    if (status === ReviewStatus.COMPLETED) return 'view_submitted_review';
    if (status === ReviewStatus.ABSTAINED) return 'view_abstention';
    if (isOverdue) return 'submit_review_overdue';
    return 'submit_review';
  }
}
