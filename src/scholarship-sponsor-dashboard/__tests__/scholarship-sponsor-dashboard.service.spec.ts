import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ScholarshipSponsorDashboardService } from '../scholarship-sponsor-dashboard.service';
import { ScholarshipProgram, ScholarshipProgramStatus } from '../../scholarships/schemas/scholarship-program.schema';
import { ScholarshipApplication, ScholarshipApplicationStatus } from '../../scholarships/schemas/scholarship-application.schema';
import { ScholarshipReview, ReviewStatus } from '../../scholarships/schemas/scholarship-review.schema';
import {
  BudgetLedger,
  BudgetReservation,
  ReservationStatus,
} from '../../scholarships/schemas/budget-reservation.schema';
import { ResourceNotFoundException } from '../../common/errors/domain.exception';

// ── Helpers ───────────────────────────────────────────────────────────────────

const oid = () => new Types.ObjectId().toHexString();

function buildModel() {
  return {
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    countDocuments: jest.fn().mockReturnThis(),
    aggregate: jest.fn(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ScholarshipSponsorDashboardService', () => {
  let service: ScholarshipSponsorDashboardService;
  let programModel: ReturnType<typeof buildModel>;
  let applicationModel: ReturnType<typeof buildModel>;
  let reviewModel: ReturnType<typeof buildModel>;
  let budgetLedgerModel: ReturnType<typeof buildModel>;
  let reservationModel: ReturnType<typeof buildModel>;

  const ORG_ID = oid();
  const PROGRAM_ID = oid();

  beforeEach(async () => {
    programModel = buildModel();
    applicationModel = buildModel();
    reviewModel = buildModel();
    budgetLedgerModel = buildModel();
    reservationModel = buildModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScholarshipSponsorDashboardService,
        { provide: getModelToken(ScholarshipProgram.name), useValue: programModel },
        { provide: getModelToken(ScholarshipApplication.name), useValue: applicationModel },
        { provide: getModelToken(ScholarshipReview.name), useValue: reviewModel },
        { provide: getModelToken(BudgetLedger.name), useValue: budgetLedgerModel },
        { provide: getModelToken(BudgetReservation.name), useValue: reservationModel },
      ],
    }).compile();

    service = module.get(ScholarshipSponsorDashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getProgramBudget ────────────────────────────────────────────────────────

  describe('getProgramBudget', () => {
    it('returns correct budget summary with commitment ratio', async () => {
      programModel.exec.mockResolvedValueOnce({
        _id: new Types.ObjectId(PROGRAM_ID),
        title: 'STEM Fund',
        status: ScholarshipProgramStatus.PUBLISHED,
      });
      budgetLedgerModel.exec.mockResolvedValueOnce({
        totalBudget: 10000,
        reservedAmount: 2000,
        disbursedAmount: 3000,
        currency: 'USD',
      });

      const result = await service.getProgramBudget(ORG_ID, PROGRAM_ID);

      expect(result.totalBudget).toBe(10000);
      expect(result.reservedAmount).toBe(2000);
      expect(result.disbursedAmount).toBe(3000);
      expect(result.availableAmount).toBe(5000);
      expect(result.commitmentRatio).toBeCloseTo(0.5, 3);
      expect(result.currency).toBe('USD');
    });

    it('returns zero amounts when no ledger exists for the program', async () => {
      programModel.exec.mockResolvedValueOnce({
        _id: new Types.ObjectId(PROGRAM_ID),
        title: 'Arts Bursary',
        status: ScholarshipProgramStatus.PUBLISHED,
      });
      budgetLedgerModel.exec.mockResolvedValueOnce(null);

      const result = await service.getProgramBudget(ORG_ID, PROGRAM_ID);

      expect(result.totalBudget).toBe(0);
      expect(result.commitmentRatio).toBe(0);
      expect(result.availableAmount).toBe(0);
    });

    it('throws ResourceNotFoundException when program not found', async () => {
      programModel.exec.mockResolvedValueOnce(null);

      await expect(service.getProgramBudget(ORG_ID, PROGRAM_ID)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  // ── getApplicationFunnel ────────────────────────────────────────────────────

  describe('getApplicationFunnel', () => {
    it('computes correct rates from status aggregate', async () => {
      programModel.exec.mockResolvedValueOnce({
        _id: new Types.ObjectId(PROGRAM_ID),
        title: 'STEM Fund',
        status: ScholarshipProgramStatus.PUBLISHED,
      });
      applicationModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: ScholarshipApplicationStatus.SUBMITTED, count: 5 },
        { _id: ScholarshipApplicationStatus.APPROVED, count: 3 },
        { _id: ScholarshipApplicationStatus.REJECTED, count: 2 },
        { _id: ScholarshipApplicationStatus.WITHDRAWN, count: 1 },
      ]);

      const result = await service.getApplicationFunnel(ORG_ID, PROGRAM_ID);

      expect(result.totalReceived).toBe(11);
      expect(result.totalApproved).toBe(3);
      expect(result.totalRejected).toBe(2);
      expect(result.totalWithdrawn).toBe(1);
      // approvalRate = 3 / (3+2) = 0.6
      expect(result.approvalRate).toBeCloseTo(0.6, 3);
      // reviewCompletionRate = (3+2) / 11 ≈ 0.4545
      expect(result.reviewCompletionRate).toBeCloseTo(0.4545, 3);
    });

    it('returns zero rates when no applications exist', async () => {
      programModel.exec.mockResolvedValueOnce({
        _id: new Types.ObjectId(PROGRAM_ID),
        title: 'Empty Fund',
        status: ScholarshipProgramStatus.PUBLISHED,
      });
      applicationModel.aggregate = jest.fn().mockResolvedValueOnce([]);

      const result = await service.getApplicationFunnel(ORG_ID, PROGRAM_ID);

      expect(result.totalReceived).toBe(0);
      expect(result.approvalRate).toBe(0);
      expect(result.reviewCompletionRate).toBe(0);
    });

    it('throws ResourceNotFoundException when program not found', async () => {
      programModel.exec.mockResolvedValueOnce(null);

      await expect(service.getApplicationFunnel(ORG_ID, PROGRAM_ID)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  // ── getReviewProgress ───────────────────────────────────────────────────────

  describe('getReviewProgress', () => {
    it('correctly counts apps with all reviews complete vs pending', async () => {
      programModel.exec.mockResolvedValueOnce({
        _id: new Types.ObjectId(PROGRAM_ID),
        title: 'STEM Fund',
        status: ScholarshipProgramStatus.PUBLISHED,
      });
      reviewModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: 'app1', completedCount: 2, pendingCount: 0, total: 2 },
        { _id: 'app2', completedCount: 1, pendingCount: 1, total: 2 },
        { _id: 'app3', completedCount: 0, pendingCount: 2, total: 2 },
      ]);

      const result = await service.getReviewProgress(ORG_ID, PROGRAM_ID);

      expect(result.totalApplicationsUnderReview).toBe(3);
      expect(result.applicationsWithAllReviewsComplete).toBe(1);
      expect(result.applicationsWithPendingReviews).toBe(2);
      // avg = (2+1+0) / 3 ≈ 1
      expect(result.avgReviewsPerApplication).toBeCloseTo(1, 1);
    });
  });

  // ── getAwardDisbursementSummary ─────────────────────────────────────────────

  describe('getAwardDisbursementSummary', () => {
    it('returns amounts with reconciliationWarning = false when totals match', async () => {
      reservationModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: null, count: 5, totalAmount: 5000, currency: 'USD' },
      ]);
      budgetLedgerModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: null, totalDisbursed: 5000, currency: 'USD' },
      ]);

      const result = await service.getAwardDisbursementSummary(ORG_ID);

      expect(result.totalAwardsMade).toBe(5);
      expect(result.totalAwardedAmount).toBe(5000);
      expect(result.totalPaidAmount).toBe(5000);
      expect(result.pendingDisbursementAmount).toBe(0);
      expect(result.reconciliationWarning).toBe(false);
    });

    it('sets reconciliationWarning = true when ledger diverges from reservations', async () => {
      reservationModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: null, count: 5, totalAmount: 5000, currency: 'USD' },
      ]);
      budgetLedgerModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: null, totalDisbursed: 4900, currency: 'USD' }, // 100 divergence
      ]);

      const result = await service.getAwardDisbursementSummary(ORG_ID);

      expect(result.reconciliationWarning).toBe(true);
      expect(result.pendingDisbursementAmount).toBe(100);
    });

    it('handles empty reservation and ledger gracefully', async () => {
      reservationModel.aggregate = jest.fn().mockResolvedValueOnce([]);
      budgetLedgerModel.aggregate = jest.fn().mockResolvedValueOnce([]);

      const result = await service.getAwardDisbursementSummary(ORG_ID);

      expect(result.totalAwardsMade).toBe(0);
      expect(result.reconciliationWarning).toBe(false);
    });
  });

  // ── getImpactReport ─────────────────────────────────────────────────────────

  describe('getImpactReport', () => {
    it('computes award rate correctly', async () => {
      programModel.exec.mockResolvedValueOnce(2); // countDocuments programs
      applicationModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: null, total: 100 },
      ]);
      reservationModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: null, count: 40, totalAmount: 40000, currency: 'USD' },
      ]);
      budgetLedgerModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: null, currency: 'USD' },
      ]);

      const result = await service.getImpactReport(ORG_ID, { organizationId: ORG_ID });

      expect(result.totalApplicants).toBe(100);
      expect(result.totalRecipients).toBe(40);
      expect(result.awardRate).toBeCloseTo(0.4, 3);
      expect(result.currency).toBe('USD');
    });

    it('returns awardRate = 0 when there are no applicants', async () => {
      programModel.exec.mockResolvedValueOnce(1);
      applicationModel.aggregate = jest.fn().mockResolvedValueOnce([]);
      reservationModel.aggregate = jest.fn().mockResolvedValueOnce([]);
      budgetLedgerModel.aggregate = jest.fn().mockResolvedValueOnce([]);

      const result = await service.getImpactReport(ORG_ID, { organizationId: ORG_ID });

      expect(result.awardRate).toBe(0);
      expect(result.totalRecipients).toBe(0);
    });
  });

  // ── listProgramBudgets ──────────────────────────────────────────────────────

  describe('listProgramBudgets', () => {
    it('returns empty data when no programs match the filter', async () => {
      programModel.exec
        .mockResolvedValueOnce([])  // find programs
        .mockResolvedValueOnce(0);  // countDocuments

      const result = await service.listProgramBudgets(ORG_ID, {
        organizationId: ORG_ID,
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('attaches ledger data to each program card', async () => {
      const progOid = new Types.ObjectId(PROGRAM_ID);
      programModel.exec
        .mockResolvedValueOnce([{ _id: progOid, title: 'Grant A', status: ScholarshipProgramStatus.PUBLISHED }])
        .mockResolvedValueOnce(1);
      budgetLedgerModel.exec.mockResolvedValueOnce([
        { programId: progOid, totalBudget: 8000, reservedAmount: 1000, disbursedAmount: 2000, currency: 'NGN' },
      ]);

      const result = await service.listProgramBudgets(ORG_ID, {
        organizationId: ORG_ID,
        page: 1,
        limit: 20,
      });

      expect(result.data[0].currency).toBe('NGN');
      expect(result.data[0].availableAmount).toBe(5000);
    });
  });
});
