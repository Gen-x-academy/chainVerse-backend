import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
  ScholarshipReview,
  ScholarshipReviewDocument,
  ReviewStatus,
} from '../scholarships/schemas/scholarship-review.schema';
import {
  BudgetLedger,
  BudgetLedgerDocument,
  BudgetReservation,
  BudgetReservationDocument,
  ReservationStatus,
} from '../scholarships/schemas/budget-reservation.schema';
import {
  ImpactReportQueryDto,
  ApplicationFunnelDto,
  AwardDisbursementSummaryDto,
  ProgramBudgetSummaryDto,
  ProgramSummaryQueryDto,
  ReviewProgressDto,
  SponsorDashboardSnapshotDto,
  SponsorImpactReportDto,
} from './dto/sponsor-dashboard.dto';
import { ResourceNotFoundException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';

/**
 * ScholarshipSponsorDashboardService
 *
 * Aggregates financial, funnel, review, and award data for a sponsor's
 * organisation-scoped dashboard.
 *
 * Ownership: all queries are filtered by `organizationId` (tenant isolation).
 * Privacy: applicant identity is never included in response objects — counts
 *   and amounts only.
 * Freshness: all methods return live data; `computedAt` reflects real-time.
 * Reconciliation: AwardDisbursementSummary flags a warning when budget ledger
 *   totals diverge from reservation sums by more than RECONCILE_TOLERANCE.
 */
@Injectable()
export class ScholarshipSponsorDashboardService {
  private static readonly RECONCILE_TOLERANCE = 0.01;

  constructor(
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    @InjectModel(ScholarshipReview.name)
    private readonly reviewModel: Model<ScholarshipReviewDocument>,
    @InjectModel(BudgetLedger.name)
    private readonly budgetLedgerModel: Model<BudgetLedgerDocument>,
    @InjectModel(BudgetReservation.name)
    private readonly reservationModel: Model<BudgetReservationDocument>,
  ) {}

  // ── Snapshot ─────────────────────────────────────────────────────────────

  /**
   * Returns a high-level dashboard snapshot aggregating all programs for the
   * sponsor's organisation.
   */
  async getSnapshot(organizationId: string): Promise<SponsorDashboardSnapshotDto> {
    const [programs, appCountResult, awardResult, ledgerResult] =
      await Promise.all([
        this.programModel
          .find({ organizationId })
          .select('_id title status')
          .lean()
          .exec(),
        this.applicationModel.aggregate<{ _id: null; total: number }>([
          { $match: { organizationId } },
          { $group: { _id: null, total: { $sum: 1 } } },
        ]),
        this.reservationModel.aggregate<{
          _id: null;
          count: number;
          totalAwarded: number;
        }>([
          {
            $match: {
              organizationId,
              status: ReservationStatus.CONFIRMED,
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              totalAwarded: { $sum: '$amount' },
            },
          },
        ]),
        this.budgetLedgerModel.aggregate<{
          _id: null;
          totalBudget: number;
          reservedAmount: number;
          disbursedAmount: number;
          currency: string;
        }>([
          { $match: { organizationId } },
          {
            $group: {
              _id: null,
              totalBudget: { $sum: '$totalBudget' },
              reservedAmount: { $sum: '$reservedAmount' },
              disbursedAmount: { $sum: '$disbursedAmount' },
              currency: { $first: '$currency' },
            },
          },
        ]),
      ]);

    const programsByStatus: Record<string, number> = {};
    for (const p of programs) {
      programsByStatus[p.status] = (programsByStatus[p.status] ?? 0) + 1;
    }

    const ledger = ledgerResult[0] ?? {
      totalBudget: 0,
      reservedAmount: 0,
      disbursedAmount: 0,
      currency: 'USD',
    };

    // Top 5 programs by budget for quick summary.
    const topPrograms = await this.listProgramBudgets(organizationId, {
      organizationId,
      page: 1,
      limit: 5,
    });

    return {
      organizationId,
      totalPrograms: programs.length,
      programsByStatus,
      totalApplicationsReceived: appCountResult[0]?.total ?? 0,
      totalAwardsMade: awardResult[0]?.count ?? 0,
      totalBudgetAllocated: ledger.totalBudget,
      totalBudgetDisbursed: ledger.disbursedAmount,
      totalBudgetAvailable:
        ledger.totalBudget - ledger.reservedAmount - ledger.disbursedAmount,
      currency: ledger.currency,
      topPrograms: topPrograms.data,
      computedAt: new Date(),
    };
  }

  // ── Program Budget Summaries ──────────────────────────────────────────────

  /**
   * Returns paginated per-program budget summaries, each reconciling
   * the BudgetLedger totals with the configured program budget.
   */
  async listProgramBudgets(
    organizationId: string,
    query: ProgramSummaryQueryDto,
  ): Promise<{ data: ProgramBudgetSummaryDto[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const programFilter: Record<string, unknown> = { organizationId };
    if (query.status) programFilter.status = query.status;

    const [programs, total] = await Promise.all([
      this.programModel
        .find(programFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.programModel.countDocuments(programFilter).exec(),
    ]);

    if (programs.length === 0) {
      return { data: [], total, page, limit };
    }

    const programIds = programs.map((p) => p._id);
    const ledgers = await this.budgetLedgerModel
      .find({ programId: { $in: programIds } })
      .lean()
      .exec();
    const ledgerByProgram = Object.fromEntries(
      ledgers.map((l) => [String(l.programId), l]),
    );

    const data: ProgramBudgetSummaryDto[] = programs.map((p) => {
      const ledger = ledgerByProgram[String(p._id)];
      const total = ledger?.totalBudget ?? 0;
      const reserved = ledger?.reservedAmount ?? 0;
      const disbursed = ledger?.disbursedAmount ?? 0;
      const available = total - reserved - disbursed;
      const commitmentRatio =
        total > 0 ? Math.min(1, (reserved + disbursed) / total) : 0;

      return {
        programId: String(p._id),
        programTitle: p.title,
        status: p.status,
        totalBudget: total,
        reservedAmount: reserved,
        disbursedAmount: disbursed,
        availableAmount: Math.max(0, available),
        currency: ledger?.currency ?? 'USD',
        commitmentRatio: Math.round(commitmentRatio * 10000) / 10000,
        computedAt: new Date(),
      };
    });

    return { data, total, page, limit };
  }

  /** Returns the budget summary for a single program. */
  async getProgramBudget(
    organizationId: string,
    programId: string,
  ): Promise<ProgramBudgetSummaryDto> {
    const program = await this.programModel
      .findOne({ _id: programId, organizationId })
      .lean()
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }

    const ledger = await this.budgetLedgerModel
      .findOne({ programId: new Types.ObjectId(programId) })
      .lean()
      .exec();

    const total = ledger?.totalBudget ?? 0;
    const reserved = ledger?.reservedAmount ?? 0;
    const disbursed = ledger?.disbursedAmount ?? 0;
    const available = total - reserved - disbursed;
    const commitmentRatio = total > 0 ? (reserved + disbursed) / total : 0;

    return {
      programId,
      programTitle: program.title,
      status: program.status,
      totalBudget: total,
      reservedAmount: reserved,
      disbursedAmount: disbursed,
      availableAmount: Math.max(0, available),
      currency: ledger?.currency ?? 'USD',
      commitmentRatio: Math.round(commitmentRatio * 10000) / 10000,
      computedAt: new Date(),
    };
  }

  // ── Application Funnel ────────────────────────────────────────────────────

  /**
   * Returns the application funnel for a single program: received → reviewed →
   * approved / rejected / withdrawn, plus derived rates.
   */
  async getApplicationFunnel(
    organizationId: string,
    programId: string,
  ): Promise<ApplicationFunnelDto> {
    const program = await this.programModel
      .findOne({ _id: programId, organizationId })
      .lean()
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }

    const statusCounts = await this.applicationModel.aggregate<{
      _id: ScholarshipApplicationStatus;
      count: number;
    }>([
      { $match: { organizationId, programId: new Types.ObjectId(programId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const byStatus = Object.fromEntries(
      statusCounts.map((s) => [s._id, s.count]),
    ) as Partial<Record<ScholarshipApplicationStatus, number>>;

    const totalReceived = Object.values(byStatus).reduce((s, c) => s + c, 0);
    const totalApproved = byStatus[ScholarshipApplicationStatus.APPROVED] ?? 0;
    const totalRejected = byStatus[ScholarshipApplicationStatus.REJECTED] ?? 0;
    const totalWithdrawn = byStatus[ScholarshipApplicationStatus.WITHDRAWN] ?? 0;
    const totalUnderReview = byStatus[ScholarshipApplicationStatus.UNDER_REVIEW] ?? 0;

    const decided = totalApproved + totalRejected;
    const reviewCompletionRate =
      totalReceived > 0 ? decided / totalReceived : 0;
    const approvalRate = decided > 0 ? totalApproved / decided : 0;

    return {
      programId,
      programTitle: program.title,
      totalReceived,
      totalUnderReview,
      totalApproved,
      totalRejected,
      totalWithdrawn,
      reviewCompletionRate: Math.round(reviewCompletionRate * 10000) / 10000,
      approvalRate: Math.round(approvalRate * 10000) / 10000,
      computedAt: new Date(),
    };
  }

  // ── Review Progress ───────────────────────────────────────────────────────

  /**
   * Aggregates review-completion progress for a program, showing how many
   * applications still have pending reviewer assignments.
   */
  async getReviewProgress(
    organizationId: string,
    programId: string,
  ): Promise<ReviewProgressDto> {
    const program = await this.programModel
      .findOne({ _id: programId, organizationId })
      .lean()
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }

    const programOid = new Types.ObjectId(programId);

    const reviewAgg = await this.reviewModel.aggregate<{
      _id: string;
      completedCount: number;
      pendingCount: number;
      total: number;
    }>([
      { $match: { programId: programOid } },
      {
        $group: {
          _id: '$applicationId',
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', ReviewStatus.COMPLETED] }, 1, 0] },
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', ReviewStatus.PENDING] }, 1, 0] },
          },
          total: { $sum: 1 },
        },
      },
    ]);

    const totalAppsUnderReview = reviewAgg.length;
    const appsAllComplete = reviewAgg.filter((r) => r.pendingCount === 0).length;
    const appsPending = totalAppsUnderReview - appsAllComplete;
    const totalReviews = reviewAgg.reduce((s, r) => s + r.completedCount, 0);
    const avgReviews =
      totalAppsUnderReview > 0
        ? totalReviews / totalAppsUnderReview
        : 0;

    return {
      programId,
      totalApplicationsUnderReview: totalAppsUnderReview,
      applicationsWithAllReviewsComplete: appsAllComplete,
      applicationsWithPendingReviews: appsPending,
      avgReviewsPerApplication: Math.round(avgReviews * 100) / 100,
      computedAt: new Date(),
    };
  }

  // ── Awards & Disbursements ────────────────────────────────────────────────

  /**
   * Returns award and disbursement totals for the organisation, optionally
   * filtered to a single program.  Flags a reconciliation warning when the
   * CONFIRMED reservation sum diverges from the ledger's `disbursedAmount`
   * by more than RECONCILE_TOLERANCE.
   */
  async getAwardDisbursementSummary(
    organizationId: string,
    programId?: string,
  ): Promise<AwardDisbursementSummaryDto> {
    const reservationFilter: Record<string, unknown> = {
      organizationId,
      status: ReservationStatus.CONFIRMED,
    };
    const ledgerFilter: Record<string, unknown> = { organizationId };
    if (programId) {
      reservationFilter.programId = new Types.ObjectId(programId);
      ledgerFilter.programId = new Types.ObjectId(programId);
    }

    const [reservationAgg, ledgerAgg] = await Promise.all([
      this.reservationModel.aggregate<{
        _id: null;
        count: number;
        totalAmount: number;
        currency: string;
      }>([
        { $match: reservationFilter },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            currency: { $first: '$currency' },
          },
        },
      ]),
      this.budgetLedgerModel.aggregate<{
        _id: null;
        totalDisbursed: number;
        currency: string;
      }>([
        { $match: ledgerFilter },
        {
          $group: {
            _id: null,
            totalDisbursed: { $sum: '$disbursedAmount' },
            currency: { $first: '$currency' },
          },
        },
      ]),
    ]);

    const totalAwards = reservationAgg[0]?.count ?? 0;
    const totalAwarded = reservationAgg[0]?.totalAmount ?? 0;
    const currency = reservationAgg[0]?.currency ?? ledgerAgg[0]?.currency ?? 'USD';
    const ledgerDisbursed = ledgerAgg[0]?.totalDisbursed ?? 0;

    const reconciliationWarning =
      Math.abs(totalAwarded - ledgerDisbursed) >
      ScholarshipSponsorDashboardService.RECONCILE_TOLERANCE;

    return {
      organizationId,
      programId,
      totalAwardsMade: totalAwards,
      totalAwardedAmount: totalAwarded,
      totalPaidAmount: ledgerDisbursed,
      pendingDisbursementAmount: Math.max(0, totalAwarded - ledgerDisbursed),
      currency,
      reconciliationWarning,
      computedAt: new Date(),
    };
  }

  // ── Impact Report ─────────────────────────────────────────────────────────

  /**
   * Returns high-level impact indicators for the sponsor across a date window.
   * Designed for export to stakeholder reports.
   */
  async getImpactReport(
    organizationId: string,
    query: ImpactReportQueryDto,
  ): Promise<SponsorImpactReportDto> {
    const dateFilter: Record<string, unknown> = {};
    if (query.from || query.to) {
      dateFilter.createdAt = {};
      if (query.from)
        (dateFilter.createdAt as Record<string, unknown>)['$gte'] = new Date(query.from);
      if (query.to)
        (dateFilter.createdAt as Record<string, unknown>)['$lte'] = new Date(query.to);
    }

    const programFilter: Record<string, unknown> = {
      organizationId,
      status: { $ne: ScholarshipProgramStatus.DRAFT },
      ...dateFilter,
    };
    if (query.programId) programFilter._id = new Types.ObjectId(query.programId);

    const appFilter: Record<string, unknown> = { organizationId, ...dateFilter };
    if (query.programId)
      appFilter.programId = new Types.ObjectId(query.programId);

    const reservationFilter: Record<string, unknown> = {
      organizationId,
      status: ReservationStatus.CONFIRMED,
      ...dateFilter,
    };
    if (query.programId)
      reservationFilter.programId = new Types.ObjectId(query.programId);

    const [programCount, applicantAgg, recipientAgg, ledgerAgg] =
      await Promise.all([
        this.programModel.countDocuments(programFilter).exec(),
        this.applicationModel.aggregate<{ _id: null; total: number }>([
          { $match: appFilter },
          { $group: { _id: null, total: { $sum: 1 } } },
        ]),
        this.reservationModel.aggregate<{
          _id: null;
          count: number;
          totalAmount: number;
          currency: string;
        }>([
          { $match: reservationFilter },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              totalAmount: { $sum: '$amount' },
              currency: { $first: '$currency' },
            },
          },
        ]),
        this.budgetLedgerModel.aggregate<{ _id: null; currency: string }>([
          { $match: { organizationId } },
          { $group: { _id: null, currency: { $first: '$currency' } } },
        ]),
      ]);

    const totalApplicants = applicantAgg[0]?.total ?? 0;
    const totalRecipients = recipientAgg[0]?.count ?? 0;
    const totalAmountAwarded = recipientAgg[0]?.totalAmount ?? 0;
    const currency =
      recipientAgg[0]?.currency ?? ledgerAgg[0]?.currency ?? 'USD';
    const awardRate =
      totalApplicants > 0 ? totalRecipients / totalApplicants : 0;

    return {
      organizationId,
      programId: query.programId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      totalProgramsLaunched: programCount,
      totalApplicants,
      totalRecipients,
      totalAmountAwarded,
      currency,
      awardRate: Math.round(awardRate * 10000) / 10000,
      computedAt: new Date(),
    };
  }
}
