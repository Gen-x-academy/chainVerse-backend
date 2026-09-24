import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
import { PaginationService } from '../../common/pagination/pagination.service';
import { ScholarshipApplicationsService } from '../services/scholarship-applications.service';
import { ApplicationDecision } from '../dto/scholarship-application.dto';
import { ErrorCode } from '../../common/errors/error-codes.enum';

describe('ScholarshipApplicationsService', () => {
  let service: ScholarshipApplicationsService;
  let applicationModel: jest.Mocked<Model<ScholarshipApplicationDocument>>;
  let programModel: jest.Mocked<Model<ScholarshipProgramDocument>>;
  let termsModel: jest.Mocked<Model<ProgramTermsVersionDocument>>;
  let paginationService: jest.Mocked<PaginationService>;

  const programId = '507f1f77bcf86cd799439011';
  const versionId = '507f1f77bcf86cd799439021';
  const applicationId = '507f1f77bcf86cd799439031';

  const makeProgram = (overrides: Record<string, unknown> = {}) => ({
    _id: programId,
    organizationId: 'org-1',
    status: ScholarshipProgramStatus.PUBLISHED,
    formFields: [],
    ...overrides,
  });

  const makeTerms = (overrides: Record<string, unknown> = {}) => ({
    _id: versionId,
    organizationId: 'org-1',
    programId,
    versionNumber: 2,
    status: TermsVersionStatus.PUBLISHED,
    eligibility: { minGpa: 3.5 },
    deadlines: { closesAt: '2026-12-01' },
    awardValue: 5000,
    awardCurrency: 'USD',
    obligations: ['maintain full-time enrollment'],
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  const makeApplication = (overrides: Record<string, unknown> = {}) => ({
    _id: applicationId,
    organizationId: 'org-1',
    programId,
    applicantId: 'student-1',
    acceptedTermsVersionId: versionId,
    acceptedTermsVersionNumber: 2,
    acceptedTermsSnapshot: { versionNumber: 2 },
    status: ScholarshipApplicationStatus.SUBMITTED,
    ...overrides,
  });

  const queryChain = (value: unknown) => ({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });

  const execResolved = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  const dto = {
    organizationId: 'org-1',
    programId,
    acceptedTermsVersionId: versionId,
    statement: 'I need this scholarship',
  };

  beforeEach(async () => {
    applicationModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    } as unknown as jest.Mocked<Model<ScholarshipApplicationDocument>>;

    programModel = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Model<ScholarshipProgramDocument>>;

    termsModel = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Model<ProgramTermsVersionDocument>>;

    paginationService = {
      paginate: jest.fn(),
    } as unknown as jest.Mocked<PaginationService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScholarshipApplicationsService,
        { provide: getModelToken(ScholarshipApplication.name), useValue: applicationModel },
        { provide: getModelToken(ScholarshipProgram.name), useValue: programModel },
        { provide: getModelToken(ProgramTermsVersion.name), useValue: termsModel },
        { provide: PaginationService, useValue: paginationService },
      ],
    }).compile();

    service = module.get<ScholarshipApplicationsService>(ScholarshipApplicationsService);
  });

  describe('apply', () => {
    it('throws not-found when the program is outside the tenant', async () => {
      programModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(service.apply(dto, 'student-1')).rejects.toMatchObject({
        code: ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      });
    });

    it('rejects an application when the program is not open', async () => {
      programModel.findOne.mockReturnValue(
        execResolved(makeProgram({ status: ScholarshipProgramStatus.DRAFT })) as never,
      );

      await expect(service.apply(dto, 'student-1')).rejects.toMatchObject({
        code: ErrorCode.BIZ_PROGRAM_NOT_OPEN,
      });
    });

    it('throws not-found when the accepted terms revision is unknown', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(service.apply(dto, 'student-1')).rejects.toMatchObject({
        code: ErrorCode.RES_TERMS_VERSION_NOT_FOUND,
      });
    });

    it('rejects acceptance of a non-published revision', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(
        execResolved(makeTerms({ status: TermsVersionStatus.SUPERSEDED })) as never,
      );

      await expect(service.apply(dto, 'student-1')).rejects.toMatchObject({
        code: ErrorCode.BIZ_TERMS_VERSION_NOT_PUBLISHED,
      });
    });

    it('rejects a duplicate application', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(execResolved(makeTerms()) as never);
      applicationModel.findOne.mockReturnValue(execResolved(makeApplication()) as never);

      await expect(service.apply(dto, 'student-1')).rejects.toMatchObject({
        code: ErrorCode.BIZ_APPLICATION_ALREADY_EXISTS,
      });
    });

    it('captures the accepted terms version and a frozen snapshot', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(execResolved(makeTerms()) as never);
      applicationModel.findOne.mockReturnValue(execResolved(null) as never);
      applicationModel.create.mockResolvedValue(makeApplication() as never);

      await service.apply(dto, 'student-1');

      expect(applicationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantId: 'student-1',
          acceptedTermsVersionId: versionId,
          acceptedTermsVersionNumber: 2,
          status: ScholarshipApplicationStatus.SUBMITTED,
          acceptedTermsSnapshot: expect.objectContaining({
            versionNumber: 2,
            awardValue: 5000,
            awardCurrency: 'USD',
            obligations: ['maintain full-time enrollment'],
          }),
        }),
      );
    });
  });

  describe('getApplicationForApplicant', () => {
    it('hides an application owned by another applicant', async () => {
      applicationModel.findById.mockReturnValue(
        execResolved(makeApplication({ applicantId: 'other' })) as never,
      );

      await expect(
        service.getApplicationForApplicant(applicationId, 'student-1'),
      ).rejects.toMatchObject({ code: ErrorCode.RES_SCHOLARSHIP_APPLICATION_NOT_FOUND });
    });

    it('returns an application owned by the applicant', async () => {
      applicationModel.findById.mockReturnValue(execResolved(makeApplication()) as never);

      const result = await service.getApplicationForApplicant(applicationId, 'student-1');

      expect(result.applicantId).toBe('student-1');
    });
  });

  describe('withdraw', () => {
    it('forbids withdrawing another applicant’s application', async () => {
      applicationModel.findById.mockReturnValue(
        execResolved(makeApplication({ applicantId: 'other' })) as never,
      );

      await expect(service.withdraw(applicationId, 'student-1')).rejects.toMatchObject({
        code: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      });
    });

    it('rejects withdrawing a decided application', async () => {
      applicationModel.findById.mockReturnValue(
        execResolved(makeApplication({ status: ScholarshipApplicationStatus.APPROVED })) as never,
      );

      await expect(service.withdraw(applicationId, 'student-1')).rejects.toMatchObject({
        code: ErrorCode.BIZ_APPLICATION_NOT_WITHDRAWABLE,
      });
    });

    it('withdraws an active application', async () => {
      applicationModel.findById.mockReturnValue(execResolved(makeApplication()) as never);
      applicationModel.findOneAndUpdate.mockReturnValue(
        execResolved(makeApplication({ status: ScholarshipApplicationStatus.WITHDRAWN })) as never,
      );

      const result = await service.withdraw(applicationId, 'student-1');

      expect(result.status).toBe(ScholarshipApplicationStatus.WITHDRAWN);
    });
  });

  describe('review', () => {
    it('throws not-found when the application is outside the tenant', async () => {
      applicationModel.findById.mockReturnValue(
        execResolved(makeApplication({ organizationId: 'org-2' })) as never,
      );

      await expect(
        service.review('org-1', applicationId, ApplicationDecision.APPROVED, 'staff-1'),
      ).rejects.toMatchObject({ code: ErrorCode.RES_SCHOLARSHIP_APPLICATION_NOT_FOUND });
    });

    it('rejects reviewing an already-decided application', async () => {
      applicationModel.findById.mockReturnValue(
        execResolved(makeApplication({ status: ScholarshipApplicationStatus.REJECTED })) as never,
      );

      await expect(
        service.review('org-1', applicationId, ApplicationDecision.APPROVED, 'staff-1'),
      ).rejects.toMatchObject({ code: ErrorCode.BIZ_APPLICATION_NOT_REVIEWABLE });
    });

    it('approves an application and records the decision', async () => {
      applicationModel.findById.mockReturnValue(execResolved(makeApplication()) as never);
      applicationModel.findOneAndUpdate.mockReturnValue(
        execResolved(makeApplication({ status: ScholarshipApplicationStatus.APPROVED })) as never,
      );

      const result = await service.review(
        'org-1',
        applicationId,
        ApplicationDecision.APPROVED,
        'staff-1',
        'strong candidate',
      );

      expect(applicationModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: applicationId }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: ScholarshipApplicationStatus.APPROVED,
            decidedBy: 'staff-1',
            decisionReason: 'strong candidate',
          }),
        }),
        { new: true },
      );
      expect(result.status).toBe(ScholarshipApplicationStatus.APPROVED);
    });
  });

  describe('listForProgram', () => {
    it('throws not-found when the program is outside the tenant', async () => {
      programModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(
        service.listForProgram('org-1', programId, {}, { page: 1, limit: 10 }),
      ).rejects.toMatchObject({ code: ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND });
    });

    it('paginates tenant-scoped applications', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listForProgram(
        'org-1',
        programId,
        { status: ScholarshipApplicationStatus.SUBMITTED },
        { page: 1, limit: 10 },
      );

      expect(paginationService.paginate).toHaveBeenCalledWith(
        applicationModel,
        { page: 1, limit: 10 },
        {
          organizationId: 'org-1',
          programId,
          status: ScholarshipApplicationStatus.SUBMITTED,
        },
      );
    });
  });
});