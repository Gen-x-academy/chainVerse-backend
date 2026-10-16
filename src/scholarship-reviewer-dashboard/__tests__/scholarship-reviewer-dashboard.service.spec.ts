import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ScholarshipReviewerDashboardService } from '../scholarship-reviewer-dashboard.service';
import {
  ScholarshipReview,
  ReviewStatus,
} from '../../scholarships/schemas/scholarship-review.schema';
import { ScholarshipProgram } from '../../scholarships/schemas/scholarship-program.schema';
import { ScholarshipApplication } from '../../scholarships/schemas/scholarship-application.schema';
import { CommitteeDecision } from '../../scholarships/schemas/committee-decision.schema';
import { ResourceNotFoundException } from '../../common/errors/domain.exception';

// ── Helpers ───────────────────────────────────────────────────────────────────

const oid = () => new Types.ObjectId().toHexString();

function buildModel() {
  return {
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
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

describe('ScholarshipReviewerDashboardService', () => {
  let service: ScholarshipReviewerDashboardService;
  let reviewModel: ReturnType<typeof buildModel>;
  let programModel: ReturnType<typeof buildModel>;
  let applicationModel: ReturnType<typeof buildModel>;
  let committeeDecisionModel: ReturnType<typeof buildModel>;

  const REVIEWER_ID = oid();
  const ORG_ID = oid();
  const PROGRAM_ID = oid();
  const APP_ID = oid();
  const REVIEW_ID = oid();

  beforeEach(async () => {
    reviewModel = buildModel();
    programModel = buildModel();
    applicationModel = buildModel();
    committeeDecisionModel = buildModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScholarshipReviewerDashboardService,
        { provide: getModelToken(ScholarshipReview.name), useValue: reviewModel },
        { provide: getModelToken(ScholarshipProgram.name), useValue: programModel },
        { provide: getModelToken(ScholarshipApplication.name), useValue: applicationModel },
        { provide: getModelToken(CommitteeDecision.name), useValue: committeeDecisionModel },
      ],
    }).compile();

    service = module.get(ScholarshipReviewerDashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getWorkload ─────────────────────────────────────────────────────────────

  describe('getWorkload', () => {
    it('returns correct status counts and completion rate', async () => {
      reviewModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: ReviewStatus.PENDING, count: 3 },
        { _id: ReviewStatus.COMPLETED, count: 6 },
        { _id: ReviewStatus.ABSTAINED, count: 1 },
      ]);
      reviewModel.exec.mockResolvedValueOnce(1); // overdueCount

      const result = await service.getWorkload(REVIEWER_ID, ORG_ID);

      expect(result.totalAssigned).toBe(10);
      expect(result.totalPending).toBe(3);
      expect(result.totalCompleted).toBe(6);
      expect(result.totalAbstained).toBe(1);
      expect(result.totalOverdue).toBe(1);
      // completionRate = (6+1)/10 = 0.7
      expect(result.completionRate).toBeCloseTo(0.7, 3);
      expect(result.reviewerId).toBe(REVIEWER_ID);
    });

    it('returns zero counts when reviewer has no assignments', async () => {
      reviewModel.aggregate = jest.fn().mockResolvedValueOnce([]);
      reviewModel.exec.mockResolvedValueOnce(0);

      const result = await service.getWorkload(REVIEWER_ID, ORG_ID);

      expect(result.totalAssigned).toBe(0);
      expect(result.completionRate).toBe(0);
    });
  });

  // ── listAssignments ─────────────────────────────────────────────────────────

  describe('listAssignments', () => {
    const progOid = new Types.ObjectId(PROGRAM_ID);
    const appOid = new Types.ObjectId(APP_ID);

    const baseQuery = {
      organizationId: ORG_ID,
      page: 1,
      limit: 20,
    };

    it('returns assignment cards with correct nextAction = submit_review', async () => {
      const past = new Date(Date.now() - 10000);
      const reviewDoc = {
        _id: new Types.ObjectId(REVIEW_ID),
        applicationId: appOid,
        programId: progOid,
        status: ReviewStatus.PENDING,
        reviewDeadline: undefined,
      };
      reviewModel.exec
        .mockResolvedValueOnce([reviewDoc]) // find
        .mockResolvedValueOnce(1);          // countDocuments
      programModel.exec.mockResolvedValueOnce([
        { _id: progOid, title: 'STEM Fund' },
      ]);
      committeeDecisionModel.exec.mockResolvedValueOnce([]); // no conflicts

      const result = await service.listAssignments(REVIEWER_ID, baseQuery);

      expect(result.total).toBe(1);
      expect(result.data[0].status).toBe(ReviewStatus.PENDING);
      expect(result.data[0].hasConflict).toBe(false);
      expect(result.data[0].isOverdue).toBe(false);
      expect(result.data[0].nextAction).toBe('submit_review');
    });

    it('marks isOverdue = true when PENDING review is past deadline', async () => {
      const pastDeadline = new Date(Date.now() - 86400000); // yesterday
      const reviewDoc = {
        _id: new Types.ObjectId(REVIEW_ID),
        applicationId: appOid,
        programId: progOid,
        status: ReviewStatus.PENDING,
        reviewDeadline: pastDeadline,
      };
      reviewModel.exec
        .mockResolvedValueOnce([reviewDoc])
        .mockResolvedValueOnce(1);
      programModel.exec.mockResolvedValueOnce([{ _id: progOid, title: 'Fund' }]);
      committeeDecisionModel.exec.mockResolvedValueOnce([]);

      const result = await service.listAssignments(REVIEWER_ID, baseQuery);

      expect(result.data[0].isOverdue).toBe(true);
      expect(result.data[0].nextAction).toBe('submit_review_overdue');
    });

    it('strips applicantName when programme has blindReview = true', async () => {
      const reviewDoc = {
        _id: new Types.ObjectId(REVIEW_ID),
        applicationId: appOid,
        programId: progOid,
        status: ReviewStatus.PENDING,
        applicantName: 'Alice Smith',
        reviewDeadline: undefined,
      };
      reviewModel.exec
        .mockResolvedValueOnce([reviewDoc])
        .mockResolvedValueOnce(1);
      // Program with blindReview = true
      programModel.exec.mockResolvedValueOnce([
        { _id: progOid, title: 'Blind Fund', blindReview: true },
      ]);
      committeeDecisionModel.exec.mockResolvedValueOnce([]);

      const result = await service.listAssignments(REVIEWER_ID, baseQuery);

      expect(result.data[0].applicantName).toBeUndefined();
    });

    it('sets hasConflict = true when reviewer authored a committee decision', async () => {
      const reviewDoc = {
        _id: new Types.ObjectId(REVIEW_ID),
        applicationId: appOid,
        programId: progOid,
        status: ReviewStatus.PENDING,
        reviewDeadline: undefined,
      };
      reviewModel.exec
        .mockResolvedValueOnce([reviewDoc])
        .mockResolvedValueOnce(1);
      programModel.exec.mockResolvedValueOnce([{ _id: progOid, title: 'Fund' }]);
      // Conflict: reviewer already decided this application
      committeeDecisionModel.exec.mockResolvedValueOnce([
        { applicationId: appOid },
      ]);

      const result = await service.listAssignments(REVIEWER_ID, baseQuery);

      expect(result.data[0].hasConflict).toBe(true);
      expect(result.data[0].nextAction).toBe('declare_conflict');
    });

    it('returns empty list when reviewer has no assignments', async () => {
      reviewModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(0);

      const result = await service.listAssignments(REVIEWER_ID, baseQuery);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ── getReview ───────────────────────────────────────────────────────────────

  describe('getReview', () => {
    it('returns the review document when ownership matches', async () => {
      const doc = {
        _id: new Types.ObjectId(REVIEW_ID),
        reviewerId: REVIEWER_ID,
        status: ReviewStatus.PENDING,
      };
      reviewModel.exec.mockResolvedValueOnce(doc);

      const result = await service.getReview(REVIEWER_ID, REVIEW_ID);

      expect(String(result._id)).toBe(REVIEW_ID);
    });

    it('throws ResourceNotFoundException when review is not found', async () => {
      reviewModel.exec.mockResolvedValueOnce(null);

      await expect(service.getReview(REVIEWER_ID, REVIEW_ID)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  // ── getConflictedApplicationIds ─────────────────────────────────────────────

  describe('getConflictedApplicationIds', () => {
    it('returns application IDs where reviewer has committee decisions', async () => {
      const appOid1 = new Types.ObjectId();
      const appOid2 = new Types.ObjectId();
      committeeDecisionModel.exec.mockResolvedValueOnce([
        { applicationId: appOid1 },
        { applicationId: appOid2 },
      ]);

      const result = await service.getConflictedApplicationIds(REVIEWER_ID, ORG_ID);

      expect(result).toHaveLength(2);
      expect(result).toContain(String(appOid1));
      expect(result).toContain(String(appOid2));
    });

    it('returns empty array when no conflicts exist', async () => {
      committeeDecisionModel.exec.mockResolvedValueOnce([]);

      const result = await service.getConflictedApplicationIds(REVIEWER_ID, ORG_ID);

      expect(result).toHaveLength(0);
    });
  });

  // ── getSnapshot ─────────────────────────────────────────────────────────────

  describe('getSnapshot', () => {
    it('returns snapshot with workload, pending, overdue, and conflicted IDs', async () => {
      const appOid = new Types.ObjectId(APP_ID);
      const progOid = new Types.ObjectId(PROGRAM_ID);

      // getWorkload aggregate
      reviewModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: ReviewStatus.PENDING, count: 2 },
        { _id: ReviewStatus.COMPLETED, count: 3 },
      ]);
      reviewModel.exec.mockResolvedValueOnce(0); // overdueCount in getWorkload

      // pendingAssignments listAssignments(PENDING)
      const pendingDoc = {
        _id: new Types.ObjectId(REVIEW_ID),
        applicationId: appOid,
        programId: progOid,
        status: ReviewStatus.PENDING,
        reviewDeadline: undefined,
      };
      reviewModel.exec
        .mockResolvedValueOnce([pendingDoc]) // find for pending
        .mockResolvedValueOnce(1);           // count for pending
      programModel.exec.mockResolvedValueOnce([{ _id: progOid, title: 'Fund' }]);
      committeeDecisionModel.exec.mockResolvedValueOnce([]); // conflicts for pending query

      // overdueAssignments listAssignments(no status filter)
      reviewModel.exec
        .mockResolvedValueOnce([])  // find returns empty → no overdue
        .mockResolvedValueOnce(0);

      // getConflictedApplicationIds
      committeeDecisionModel.exec.mockResolvedValueOnce([]);

      const snap = await service.getSnapshot(REVIEWER_ID, ORG_ID);

      expect(snap.reviewerId).toBe(REVIEWER_ID);
      expect(snap.workload.totalAssigned).toBe(5);
      expect(snap.workload.totalPending).toBe(2);
      expect(snap.conflictedApplicationIds).toHaveLength(0);
      expect(snap.computedAt).toBeInstanceOf(Date);
    });
  });
});
