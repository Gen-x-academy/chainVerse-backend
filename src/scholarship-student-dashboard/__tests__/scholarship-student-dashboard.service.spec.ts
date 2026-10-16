import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ScholarshipStudentDashboardService } from '../scholarship-student-dashboard.service';
import { ApplicationDraft } from '../schemas/application-draft.schema';
import { ScholarshipProgram, ScholarshipProgramStatus } from '../../scholarships/schemas/scholarship-program.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationStatus,
} from '../../scholarships/schemas/scholarship-application.schema';
import { ReviewInfoRequest } from '../../scholarships/schemas/review-info-request.schema';
import {
  ResourceNotFoundException,
  ResourceConflictException,
  BusinessRuleException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

// ── Helpers ──────────────────────────────────────────────────────────────────

const oid = () => new Types.ObjectId().toHexString();

function buildModel(overrides: Record<string, unknown> = {}) {
  return {
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    deleteOne: jest.fn(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn(),
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ScholarshipStudentDashboardService', () => {
  let service: ScholarshipStudentDashboardService;
  let draftModel: ReturnType<typeof buildModel>;
  let programModel: ReturnType<typeof buildModel>;
  let applicationModel: ReturnType<typeof buildModel>;
  let infoRequestModel: ReturnType<typeof buildModel>;

  const APPLICANT_ID = oid();
  const PROGRAM_ID = oid();
  const ORG_ID = oid();

  beforeEach(async () => {
    draftModel = buildModel();
    programModel = buildModel();
    applicationModel = buildModel();
    infoRequestModel = buildModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScholarshipStudentDashboardService,
        { provide: getModelToken(ApplicationDraft.name), useValue: draftModel },
        { provide: getModelToken(ScholarshipProgram.name), useValue: programModel },
        { provide: getModelToken(ScholarshipApplication.name), useValue: applicationModel },
        { provide: getModelToken(ReviewInfoRequest.name), useValue: infoRequestModel },
      ],
    }).compile();

    service = module.get(ScholarshipStudentDashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── discoverPrograms ────────────────────────────────────────────────────────

  describe('discoverPrograms', () => {
    it('returns paginated program cards annotated with applicantHasApplied', async () => {
      const prog = {
        _id: new Types.ObjectId(PROGRAM_ID),
        organizationId: ORG_ID,
        title: 'STEM Grant',
        status: ScholarshipProgramStatus.PUBLISHED,
      };
      programModel.exec
        .mockResolvedValueOnce([prog])   // find programs
        .mockResolvedValueOnce(1);       // countDocuments
      applicationModel.exec.mockResolvedValueOnce([
        { programId: new Types.ObjectId(PROGRAM_ID) },
      ]);

      const result = await service.discoverPrograms(APPLICANT_ID, {
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(1);
      expect(result.data[0].programId).toBe(PROGRAM_ID);
      expect(result.data[0].applicantHasApplied).toBe(true);
    });

    it('marks applicantHasApplied false when no existing application', async () => {
      const prog = {
        _id: new Types.ObjectId(PROGRAM_ID),
        organizationId: ORG_ID,
        title: 'Arts Bursary',
        status: ScholarshipProgramStatus.PUBLISHED,
      };
      programModel.exec
        .mockResolvedValueOnce([prog])
        .mockResolvedValueOnce(1);
      applicationModel.exec.mockResolvedValueOnce([]);

      const result = await service.discoverPrograms(APPLICANT_ID, { page: 1, limit: 20 });

      expect(result.data[0].applicantHasApplied).toBe(false);
    });

    it('returns empty data when no programs exist', async () => {
      programModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(0);
      applicationModel.exec.mockResolvedValueOnce([]);

      const result = await service.discoverPrograms(APPLICANT_ID, {});

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ── saveDraft ───────────────────────────────────────────────────────────────

  describe('saveDraft', () => {
    const dto = {
      programId: PROGRAM_ID,
      organizationId: ORG_ID,
      answers: { [oid()]: 'my answer' },
      statement: 'I am passionate about STEM.',
    };

    it('creates a new draft when none exists', async () => {
      const prog = { _id: new Types.ObjectId(PROGRAM_ID), status: ScholarshipProgramStatus.PUBLISHED, formFields: [] };
      programModel.exec.mockResolvedValueOnce(prog);     // findOne program
      applicationModel.exec.mockResolvedValueOnce(null); // findOne application
      draftModel.exec.mockResolvedValueOnce(null);       // findOne existing draft
      const createdDraft = { _id: oid(), ...dto, submitted: false, submittedAt: null };
      draftModel.create.mockResolvedValueOnce(createdDraft);

      const result = await service.saveDraft(APPLICANT_ID, dto);

      expect(draftModel.create).toHaveBeenCalledTimes(1);
      expect(result.submitted).toBe(false);
    });

    it('updates an existing draft on repeated save', async () => {
      const prog = { _id: new Types.ObjectId(PROGRAM_ID), status: ScholarshipProgramStatus.PUBLISHED, formFields: [] };
      programModel.exec.mockResolvedValueOnce(prog);
      applicationModel.exec.mockResolvedValueOnce(null);
      const existing = {
        answers: {},
        statement: '',
        submitted: false,
        save: jest.fn().mockResolvedValue({ answers: dto.answers, statement: dto.statement }),
      };
      draftModel.exec.mockResolvedValueOnce(existing);

      await service.saveDraft(APPLICANT_ID, dto);

      expect(existing.save).toHaveBeenCalled();
      expect(draftModel.create).not.toHaveBeenCalled();
    });

    it('throws ResourceNotFoundException when program not found', async () => {
      programModel.exec.mockResolvedValueOnce(null);

      await expect(service.saveDraft(APPLICANT_ID, dto)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    it('throws ResourceConflictException when application already submitted', async () => {
      programModel.exec.mockResolvedValueOnce({
        _id: new Types.ObjectId(PROGRAM_ID),
        status: ScholarshipProgramStatus.PUBLISHED,
        formFields: [],
      });
      applicationModel.exec.mockResolvedValueOnce({ _id: oid() });

      await expect(service.saveDraft(APPLICANT_ID, dto)).rejects.toThrow(
        ResourceConflictException,
      );
    });
  });

  // ── getDraft ────────────────────────────────────────────────────────────────

  describe('getDraft', () => {
    const DRAFT_ID = oid();

    it('returns draft when caller owns it', async () => {
      const draft = { _id: DRAFT_ID, applicantId: APPLICANT_ID, submitted: false };
      draftModel.exec.mockResolvedValueOnce(draft);

      const result = await service.getDraft(APPLICANT_ID, DRAFT_ID);

      expect(result.applicantId).toBe(APPLICANT_ID);
    });

    it('throws ResourceNotFoundException when draft not found', async () => {
      draftModel.exec.mockResolvedValueOnce(null);

      await expect(service.getDraft(APPLICANT_ID, DRAFT_ID)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    it('throws ForbiddenException when caller does not own the draft', async () => {
      const draft = { _id: DRAFT_ID, applicantId: oid(), submitted: false };
      draftModel.exec.mockResolvedValueOnce(draft);

      await expect(service.getDraft(APPLICANT_ID, DRAFT_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── submitDraft ─────────────────────────────────────────────────────────────

  describe('submitDraft', () => {
    const DRAFT_ID = oid();
    const FIELD_ID = new Types.ObjectId();

    it('marks draft as submitted when all required fields are answered', async () => {
      const program = {
        _id: new Types.ObjectId(PROGRAM_ID),
        formFields: [{ _id: FIELD_ID, label: 'Essay', required: true }],
      };
      const draft = {
        _id: DRAFT_ID,
        applicantId: APPLICANT_ID,
        programId: new Types.ObjectId(PROGRAM_ID),
        answers: { [String(FIELD_ID)]: 'My essay answer' },
        statement: '',
        submitted: false,
        save: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
      };
      draftModel.exec.mockResolvedValueOnce(draft);
      programModel.exec.mockResolvedValueOnce(program);

      const result = await service.submitDraft(APPLICANT_ID, DRAFT_ID, {});

      expect(draft.save).toHaveBeenCalled();
      expect(draft.submitted).toBe(true);
      expect(draft.submittedAt).toBeInstanceOf(Date);
    });

    it('throws BusinessRuleException when required field is missing', async () => {
      const FIELD_ID2 = new Types.ObjectId();
      const program = {
        _id: new Types.ObjectId(PROGRAM_ID),
        formFields: [{ _id: FIELD_ID2, label: 'Essay', required: true }],
      };
      const draft = {
        _id: DRAFT_ID,
        applicantId: APPLICANT_ID,
        programId: new Types.ObjectId(PROGRAM_ID),
        answers: {},
        statement: '',
        submitted: false,
        save: jest.fn(),
      };
      draftModel.exec.mockResolvedValueOnce(draft);
      programModel.exec.mockResolvedValueOnce(program);

      await expect(
        service.submitDraft(APPLICANT_ID, DRAFT_ID, {}),
      ).rejects.toThrow(BusinessRuleException);
      expect(draft.save).not.toHaveBeenCalled();
    });

    it('throws BusinessRuleException when draft already submitted', async () => {
      const draft = {
        _id: DRAFT_ID,
        applicantId: APPLICANT_ID,
        submitted: true,
        save: jest.fn(),
      };
      draftModel.exec.mockResolvedValueOnce(draft);

      await expect(
        service.submitDraft(APPLICANT_ID, DRAFT_ID, {}),
      ).rejects.toThrow(BusinessRuleException);
    });
  });

  // ── listMyApplications ──────────────────────────────────────────────────────

  describe('listMyApplications', () => {
    it('returns application status cards with hasPendingInfoRequest annotation', async () => {
      const appId = new Types.ObjectId();
      const progId = new Types.ObjectId();
      const app = {
        _id: appId,
        programId: progId,
        status: ScholarshipApplicationStatus.UNDER_REVIEW,
        decidedAt: undefined,
        decisionReason: undefined,
        createdAt: new Date(),
      };
      applicationModel.exec
        .mockResolvedValueOnce([app])  // find applications
        .mockResolvedValueOnce(1);     // countDocuments
      programModel.exec.mockResolvedValueOnce([{ _id: progId, title: 'STEM Grant' }]);
      infoRequestModel.exec.mockResolvedValueOnce([{ applicationId: appId }]);

      const result = await service.listMyApplications(APPLICANT_ID, { page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.data[0].hasPendingInfoRequest).toBe(true);
      expect(result.data[0].status).toBe(ScholarshipApplicationStatus.UNDER_REVIEW);
      expect(result.data[0].nextAction).toBe('respond_to_info_request');
    });

    it('returns empty list when applicant has no applications', async () => {
      applicationModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(0);

      const result = await service.listMyApplications(APPLICANT_ID, {});

      expect(result.data).toHaveLength(0);
    });
  });

  // ── getSnapshot ─────────────────────────────────────────────────────────────

  describe('getSnapshot', () => {
    it('returns correct counts from aggregate and drafts query', async () => {
      const appId = new Types.ObjectId();
      const progId = new Types.ObjectId();

      applicationModel.aggregate = jest.fn().mockResolvedValueOnce([
        { _id: ScholarshipApplicationStatus.APPROVED, count: 2 },
        { _id: ScholarshipApplicationStatus.UNDER_REVIEW, count: 1 },
      ]);
      draftModel.exec.mockResolvedValueOnce(3); // countDocuments drafts
      applicationModel.exec.mockResolvedValueOnce([
        { _id: appId, programId: progId, status: ScholarshipApplicationStatus.APPROVED, createdAt: new Date() },
      ]); // recent apps
      infoRequestModel.exec.mockResolvedValueOnce([]); // open info requests
      programModel.exec.mockResolvedValueOnce([{ _id: progId, title: 'STEM Grant' }]);

      const snap = await service.getSnapshot(APPLICANT_ID);

      expect(snap.applicantId).toBe(APPLICANT_ID);
      expect(snap.totalApproved).toBe(2);
      expect(snap.totalUnderReview).toBe(1);
      expect(snap.totalDrafts).toBe(3);
      expect(snap.computedAt).toBeInstanceOf(Date);
    });
  });

  // ── deleteDraft ─────────────────────────────────────────────────────────────

  describe('deleteDraft', () => {
    const DRAFT_ID = oid();

    it('deletes a non-submitted draft', async () => {
      const draft = { _id: DRAFT_ID, applicantId: APPLICANT_ID, submitted: false };
      draftModel.exec.mockResolvedValueOnce(draft);
      draftModel.deleteOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });

      await expect(service.deleteDraft(APPLICANT_ID, DRAFT_ID)).resolves.toBeUndefined();
      expect(draftModel.deleteOne).toHaveBeenCalledWith({ _id: DRAFT_ID });
    });

    it('throws BusinessRuleException when draft is already submitted', async () => {
      const draft = { _id: DRAFT_ID, applicantId: APPLICANT_ID, submitted: true };
      draftModel.exec.mockResolvedValueOnce(draft);

      await expect(service.deleteDraft(APPLICANT_ID, DRAFT_ID)).rejects.toThrow(
        BusinessRuleException,
      );
    });
  });
});
