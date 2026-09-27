import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
  ScholarshipProgramStatus,
} from '../schemas/scholarship-program.schema';
import {
  ProgramTermsVersion,
  ProgramTermsVersionDocument,
  ProgramTermsVersionSchema,
  TermsVersionStatus,
} from '../schemas/program-terms-version.schema';
import { PaginationService } from '../../common/pagination/pagination.service';
import { ScholarshipProgramsService } from '../services/scholarship-programs.service';
import { ErrorCode } from '../../common/errors/error-codes.enum';

describe('ScholarshipProgramsService', () => {
  let service: ScholarshipProgramsService;
  let programModel: jest.Mocked<Model<ScholarshipProgramDocument>>;
  let termsModel: jest.Mocked<Model<ProgramTermsVersionDocument>>;
  let paginationService: jest.Mocked<PaginationService>;

  const makeProgram = (overrides: Record<string, unknown> = {}) => ({
    _id: '507f1f77bcf86cd799439011',
    organizationId: 'org-1',
    title: 'STEM Scholars',
    status: ScholarshipProgramStatus.DRAFT,
    currentTermsVersionNumber: 0,
    createdBy: 'staff-1',
    ...overrides,
  });

  const makeTerms = (overrides: Record<string, unknown> = {}) => ({
    _id: '507f1f77bcf86cd799439021',
    organizationId: 'org-1',
    programId: '507f1f77bcf86cd799439011',
    versionNumber: 1,
    status: TermsVersionStatus.DRAFT,
    eligibility: { minGpa: 3.5 },
    deadlines: { closesAt: '2026-12-01' },
    awardValue: 5000,
    awardCurrency: 'USD',
    obligations: ['maintain full-time enrollment'],
    createdBy: 'staff-1',
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

  beforeEach(async () => {
    programModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      updateOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    } as unknown as jest.Mocked<Model<ScholarshipProgramDocument>>;

    termsModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      updateMany: jest.fn(),
      findOneAndUpdate: jest.fn(),
    } as unknown as jest.Mocked<Model<ProgramTermsVersionDocument>>;

    paginationService = {
      paginate: jest.fn(),
    } as unknown as jest.Mocked<PaginationService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScholarshipProgramsService,
        { provide: getModelToken(ScholarshipProgram.name), useValue: programModel },
        { provide: getModelToken(ProgramTermsVersion.name), useValue: termsModel },
        { provide: PaginationService, useValue: paginationService },
      ],
    }).compile();

    service = module.get<ScholarshipProgramsService>(ScholarshipProgramsService);
  });

  describe('createProgram', () => {
    it('creates a draft program owned by the organization', async () => {
      programModel.create.mockResolvedValue(makeProgram() as never);

      await service.createProgram(
        { organizationId: 'org-1', title: 'STEM Scholars' },
        'staff-1',
      );

      expect(programModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          title: 'STEM Scholars',
          status: ScholarshipProgramStatus.DRAFT,
          createdBy: 'staff-1',
          currentTermsVersionNumber: 0,
        }),
      );
    });
  });

  describe('listPrograms', () => {
    it('scopes the list to the organization', async () => {
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listPrograms(
        'org-1',
        { status: ScholarshipProgramStatus.PUBLISHED },
        { page: 1, limit: 10 },
      );

      expect(paginationService.paginate).toHaveBeenCalledWith(
        programModel,
        { page: 1, limit: 10 },
        { organizationId: 'org-1', status: ScholarshipProgramStatus.PUBLISHED },
      );
    });
  });

  describe('getProgram', () => {
    it('throws RES_SCHOLARSHIP_PROGRAM_NOT_FOUND when outside the tenant', async () => {
      programModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(service.getProgram('org-1', 'program-x')).rejects.toMatchObject({
        code: ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      });
    });

    it('returns the program when found', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);

      const result = await service.getProgram('org-1', '507f1f77bcf86cd799439011');

      expect(result).toMatchObject({ organizationId: 'org-1' });
    });
  });

  describe('createTermsDraft', () => {
    const dto = {
      eligibility: { minGpa: 3.5 },
      deadlines: { closesAt: '2026-12-01' },
      awardValue: 5000,
      awardCurrency: 'USD',
      obligations: ['maintain full-time enrollment'],
    };

    it('throws not-found when the program is outside the tenant', async () => {
      programModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(
        service.createTermsDraft('org-1', 'program-x', dto, 'staff-1'),
      ).rejects.toMatchObject({ code: ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND });
    });

    it('increments the version number from the latest revision', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(queryChain(makeTerms({ versionNumber: 3 })) as never);
      termsModel.create.mockResolvedValue(makeTerms({ versionNumber: 4 }) as never);

      await service.createTermsDraft('org-1', '507f1f77bcf86cd799439011', dto, 'staff-1');

      expect(termsModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          versionNumber: 4,
          status: TermsVersionStatus.DRAFT,
          createdBy: 'staff-1',
          eligibility: dto.eligibility,
        }),
      );
    });

    it('starts at version 1 when no revision exists', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(queryChain(null) as never);
      termsModel.create.mockResolvedValue(makeTerms() as never);

      await service.createTermsDraft('org-1', '507f1f77bcf86cd799439011', dto, 'staff-1');

      expect(termsModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ versionNumber: 1 }),
      );
    });
  });

  describe('publishTerms', () => {
    it('throws not-found when the revision does not exist', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(
        service.publishTerms('org-1', '507f1f77bcf86cd799439011', 'version-x', 'staff-1'),
      ).rejects.toMatchObject({ code: ErrorCode.RES_TERMS_VERSION_NOT_FOUND });
    });

    it('refuses to publish a non-draft revision', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(
        execResolved(makeTerms({ status: TermsVersionStatus.PUBLISHED })) as never,
      );

      await expect(
        service.publishTerms('org-1', '507f1f77bcf86cd799439011', '507f1f77bcf86cd799439021', 'staff-1'),
      ).rejects.toMatchObject({ code: ErrorCode.BIZ_TERMS_VERSION_NOT_DRAFT });
    });

    it('supersedes the previous published revision and marks the program current', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(execResolved(makeTerms()) as never);
      termsModel.updateMany.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);
      const published = makeTerms({ status: TermsVersionStatus.PUBLISHED });
      termsModel.findOneAndUpdate.mockReturnValue(execResolved(published) as never);
      programModel.updateOne.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);

      const result = await service.publishTerms(
        'org-1',
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439021',
        'staff-1',
      );

      expect(termsModel.updateMany).toHaveBeenCalledWith(
        { programId: '507f1f77bcf86cd799439011', status: TermsVersionStatus.PUBLISHED },
        { $set: { status: TermsVersionStatus.SUPERSEDED } },
      );
      expect(termsModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '507f1f77bcf86cd799439021', status: TermsVersionStatus.DRAFT },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: TermsVersionStatus.PUBLISHED,
            publishedBy: 'staff-1',
          }),
        }),
        { new: true },
      );
      expect(programModel.updateOne).toHaveBeenCalledWith(
        { _id: '507f1f77bcf86cd799439011' },
        {
          $set: {
            currentTermsVersionId: '507f1f77bcf86cd799439021',
            currentTermsVersionNumber: 1,
          },
        },
      );
      expect(result.status).toBe(TermsVersionStatus.PUBLISHED);
    });
  });

  describe('getTermsVersion', () => {
    it('throws not-found for an unknown revision', async () => {
      termsModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(
        service.getTermsVersion('org-1', '507f1f77bcf86cd799439011', 'version-x'),
      ).rejects.toMatchObject({ code: ErrorCode.RES_TERMS_VERSION_NOT_FOUND });
    });
  });

  describe('program lifecycle state machine (#1248)', () => {
    const programId = '507f1f77bcf86cd799439011';

    it('does not expose an unvalidated status setter on the service', () => {
      // The legacy `setProgramStatus` wrote an arbitrary status with no
      // state-machine check and no audit entry, which allowed a CLOSED or
      // ARCHIVED program to be silently reopened. It must not come back.
      const surface = Object.getOwnPropertyNames(
        ScholarshipProgramsService.prototype,
      ) as string[];
      expect(surface).not.toContain('setProgramStatus');
      expect(
        surface.filter((name) => /status/i.test(name)),
      ).toEqual(['transitionProgramStatus']);
    });

    it('rejects reopening a CLOSED program', async () => {
      programModel.findOne.mockReturnValue(
        execResolved(makeProgram({ status: ScholarshipProgramStatus.CLOSED })) as never,
      );

      await expect(
        service.transitionProgramStatus(
          'org-1',
          programId,
          ScholarshipProgramStatus.PUBLISHED,
          'staff-1',
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_PROGRAM_INVALID_TRANSITION,
      });
      expect(programModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects every transition out of ARCHIVED', async () => {
      for (const target of Object.values(ScholarshipProgramStatus)) {
        programModel.findOne.mockReturnValue(
          execResolved(makeProgram({ status: ScholarshipProgramStatus.ARCHIVED })) as never,
        );

        await expect(
          service.transitionProgramStatus('org-1', programId, target, 'staff-1'),
        ).rejects.toMatchObject({ code: ErrorCode.BIZ_PROGRAM_ARCHIVED });
      }
      expect(programModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects skipping a lifecycle step (DRAFT → CLOSED)', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);

      await expect(
        service.transitionProgramStatus(
          'org-1',
          programId,
          ScholarshipProgramStatus.CLOSED,
          'staff-1',
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_PROGRAM_INVALID_TRANSITION,
      });
      expect(programModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('records the actor and timestamp in the append-only history', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      programModel.findOneAndUpdate.mockReturnValue(
        execResolved(
          makeProgram({ status: ScholarshipProgramStatus.PUBLISHED }),
        ) as never,
      );

      await service.transitionProgramStatus(
        'org-1',
        programId,
        ScholarshipProgramStatus.PUBLISHED,
        'staff-1',
      );

      expect(programModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: programId, organizationId: 'org-1', status: ScholarshipProgramStatus.DRAFT },
        expect.objectContaining({
          $push: {
            statusHistory: expect.objectContaining({
              status: ScholarshipProgramStatus.PUBLISHED,
              changedBy: 'staff-1',
              changedAt: expect.any(Date),
            }),
          },
        }),
        { new: true },
      );
    });

    it('reports a conflict when a concurrent transition already moved the program', async () => {
      // The conditional filter matched nothing, i.e. another actor advanced
      // the program between our read and our write.
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      programModel.findOneAndUpdate.mockReturnValue(execResolved(null) as never);

      await expect(
        service.transitionProgramStatus(
          'org-1',
          programId,
          ScholarshipProgramStatus.PUBLISHED,
          'staff-1',
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_PROGRAM_INVALID_TRANSITION,
      });
    });

    it('refuses to transition a program owned by another tenant', async () => {
      programModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(
        service.transitionProgramStatus(
          'org-2',
          programId,
          ScholarshipProgramStatus.PUBLISHED,
          'staff-1',
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      });
    });
  });

  describe('published revision immutability', () => {
    it('marks every terms content field immutable at the schema level', () => {
      for (const field of [
        'versionNumber',
        'eligibility',
        'deadlines',
        'awardValue',
        'awardCurrency',
        'obligations',
      ]) {
        const schemaPath = ProgramTermsVersionSchema.path(field) as any;
        expect(schemaPath.options.immutable).toBe(true);
      }
    });
  });
});