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
        { status: ScholarshipProgramStatus.PUBLISHED, includeClosed: true },
        { page: 1, limit: 10 },
      );

      expect(paginationService.paginate).toHaveBeenCalledWith(
        programModel,
        { page: 1, limit: 10 },
        { organizationId: 'org-1', status: ScholarshipProgramStatus.PUBLISHED },
      );
    });

    it('defaults the catalog to published programs only (#1175)', async () => {
      // The catalog is a discovery surface: by default it must not surface
      // programs a student can no longer apply to.
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listPrograms('org-1', {}, { page: 1, limit: 10 });

      expect(paginationService.paginate).toHaveBeenCalledWith(
        programModel,
        { page: 1, limit: 10 },
        { organizationId: 'org-1', status: { $in: [ScholarshipProgramStatus.PUBLISHED] } },
      );
    });

    it('lets staff include closed and archived programs', async () => {
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listPrograms(
        'org-1',
        { status: ScholarshipProgramStatus.CLOSED, includeClosed: true },
        { page: 1, limit: 10 },
      );

      expect(paginationService.paginate).toHaveBeenCalledWith(
        programModel,
        { page: 1, limit: 10 },
        { organizationId: 'org-1', status: ScholarshipProgramStatus.CLOSED },
      );
    });

    it('matches search text against title and description, escaped', async () => {
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listPrograms(
        'org-1',
        { search: 'stellar (smart)' },
        { page: 1, limit: 10 },
      );

      const filter = (paginationService.paginate as jest.Mock).mock.calls[0][2];
      // The regex metacharacters must be escaped, otherwise a query containing
      // "(" or ")" would be interpreted as a pattern and throw.
      expect(filter.$or).toHaveLength(2);
      expect(String(filter.$or[0].title)).toContain('\\(');
    });

    it('filters by award value range', async () => {
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listPrograms(
        'org-1',
        { minAwardValue: 1000, maxAwardValue: 5000 },
        { page: 1, limit: 10 },
      );

      const filter = (paginationService.paginate as jest.Mock).mock.calls[0][2];
      expect(filter.awardValue).toEqual({ $gte: 1000, $lte: 5000 });
    });

    it('treats an open-ended award range as one-sided', async () => {
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listPrograms('org-1', { minAwardValue: 1000 }, {
        page: 1,
        limit: 10,
      });

      const filter = (paginationService.paginate as jest.Mock).mock.calls[0][2];
      expect(filter.awardValue).toEqual({ $gte: 1000 });
    });

    it('upper-cases the award currency filter', async () => {
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listPrograms('org-1', { awardCurrency: 'usd' }, {
        page: 1,
        limit: 10,
      });

      const filter = (paginationService.paginate as jest.Mock).mock.calls[0][2];
      expect(filter.awardCurrency).toBe('USD');
    });

    it('filters by deadline window', async () => {
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listPrograms(
        'org-1',
        { deadlineAfter: new Date('2026-01-01'), deadlineBefore: new Date('2026-12-31') },
        { page: 1, limit: 10 },
      );

      const filter = (paginationService.paginate as jest.Mock).mock.calls[0][2];
      expect(filter.applicationDeadline).toEqual({
        $gte: new Date('2026-01-01'),
        $lte: new Date('2026-12-31'),
      });
    });

    it('filters by funding type and network', async () => {
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listPrograms(
        'org-1',
        { fundingType: 'horizon', network: 'public' },
        { page: 1, limit: 10 },
      );

      const filter = (paginationService.paginate as jest.Mock).mock.calls[0][2];
      expect(filter.fundingType).toBe('horizon');
      expect(filter.network).toBe('public');
    });

    it('combines filters into one query', async () => {
      // A client can send several filters at once; they must narrow the SAME
      // query that produces `total`, so counts always reflect the filters.
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listPrograms(
        'org-1',
        {
          search: 'stellar',
          minAwardValue: 500,
          awardCurrency: 'USD',
          fundingType: 'deposit',
        },
        { page: 1, limit: 10 },
      );

      const filter = (paginationService.paginate as jest.Mock).mock.calls[0][2];
      expect(Object.keys(filter).sort()).toEqual(
        ['$or', 'awardCurrency', 'awardValue', 'fundingType', 'organizationId', 'status'].sort(),
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

    it('keeps the catalog search projection in step with the published terms (#1175)', async () => {
      // Award value, currency and deadline live on the terms revision. The
      // catalog filters on a denormalized copy of them, so publishing a new
      // revision must update that copy — otherwise the award and deadline
      // filters silently keep matching the *previous* terms.
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(execResolved(makeTerms()) as never);
      termsModel.updateMany.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);
      termsModel.findOneAndUpdate.mockReturnValue(
        execResolved(
          makeTerms({
            status: TermsVersionStatus.PUBLISHED,
            awardValue: 2500,
            awardCurrency: 'USDC',
            deadlines: { closesAt: '2026-11-30T00:00:00.000Z' },
          }),
        ) as never,
      );
      programModel.updateOne.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);

      await service.publishTerms(
        'org-1',
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439021',
        'staff-1',
      );

      expect(programModel.updateOne).toHaveBeenCalledWith(
        { _id: '507f1f77bcf86cd799439011' },
        expect.objectContaining({
          $set: expect.objectContaining({
            awardValue: 2500,
            awardCurrency: 'USDC',
            applicationDeadline: new Date('2026-11-30T00:00:00.000Z'),
          }),
        }),
      );
    });

    it('stores a null deadline when the revision publishes none', async () => {
      programModel.findOne.mockReturnValue(execResolved(makeProgram()) as never);
      termsModel.findOne.mockReturnValue(execResolved(makeTerms()) as never);
      termsModel.updateMany.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);
      termsModel.findOneAndUpdate.mockReturnValue(
        execResolved(makeTerms({ status: TermsVersionStatus.PUBLISHED })) as never,
      );
      programModel.updateOne.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);

      await service.publishTerms(
        'org-1',
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439021',
        'staff-1',
      );

      const $set = (programModel.updateOne as jest.Mock).mock.calls[0][1].$set;
      // "No deadline" must be stored as null, never guessed from createdAt.
      expect($set.applicationDeadline).toBeNull();
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