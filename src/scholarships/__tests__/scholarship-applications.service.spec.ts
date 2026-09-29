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
import { SortOrder } from '../../common/dto/pagination.dto';
import { ScholarshipApplicationsService } from '../services/scholarship-applications.service';
import {
  APPLICATION_HISTORY_MAX_LIMIT,
  ApplicationDecision,
  ApplicationHistorySortField,
} from '../dto/scholarship-application.dto';
import { DEFAULT_APPLICATION_HISTORY_LIMIT } from '../services/scholarship-applications.service';
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

  describe('listMine pagination (#1249)', () => {
    it('scopes the history to the authenticated applicant', async () => {
      paginationService.paginate.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      } as never);

      await service.listMine('student-1', {});

      expect(paginationService.paginate).toHaveBeenCalledWith(
        applicationModel,
        { page: 1, limit: DEFAULT_APPLICATION_HISTORY_LIMIT },
        { applicantId: 'student-1' },
        undefined,
        { createdAt: -1, _id: -1 },
      );
    });

    it('adds a deterministic _id tie-breaker to the requested sort field', async () => {
      paginationService.paginate.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      } as never);

      await service.listMine('student-1', {
        page: 3,
        limit: 50,
        sortBy: ApplicationHistorySortField.UPDATED_AT,
        sortOrder: SortOrder.ASC,
      });

      expect(paginationService.paginate).toHaveBeenCalledWith(
        applicationModel,
        { page: 3, limit: 50 },
        { applicantId: 'student-1' },
        undefined,
        { updatedAt: 1, _id: 1 },
      );
    });

    it('caps the page size at the documented maximum even if bypassed', async () => {
      paginationService.paginate.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: APPLICATION_HISTORY_MAX_LIMIT,
        totalPages: 0,
      } as never);

      // The DTO rejects `limit > 100`, but the service clamps as well so a
      // future caller (a job, an internal route) cannot reintroduce an
      // unbounded page.
      await service.listMine('student-1', { limit: 5_000 });

      expect(paginationService.paginate).toHaveBeenCalledWith(
        applicationModel,
        { page: 1, limit: APPLICATION_HISTORY_MAX_LIMIT },
        { applicantId: 'student-1' },
        undefined,
        { createdAt: -1, _id: -1 },
      );
    });
  });

  describe('listMine over a large history', () => {
    /**
     * In-memory stand-in for the Mongoose model.  Deliberately not a jest mock
     * of `PaginationService`: the point of these cases is the interaction
     * between the service and the *real* paginator over a dataset with many
     * rows that share a `createdAt` value, which is where duplicates and gaps
     * come from.
     */
    interface HistoryRow {
      _id: string;
      applicantId: string;
      createdAt: string;
    }

    /** Minimal chainable query, matching the subset of the Mongoose API used. */
    class FakeQuery {
      private sortSpec: Record<string, 1 | -1> = {};
      private skipCount = 0;
      private limitCount: number | undefined;

      constructor(
        private readonly rows: HistoryRow[],
        private readonly filter: Record<string, unknown>,
      ) {}

      sort(spec: Record<string, 1 | -1>): this {
        this.sortSpec = { ...this.sortSpec, ...spec };
        return this;
      }

      skip(n: number): this {
        this.skipCount = n;
        return this;
      }

      limit(n: number): this {
        this.limitCount = n;
        return this;
      }

      private matching(): HistoryRow[] {
        return this.rows.filter((row) =>
          Object.entries(this.filter).every(
            ([key, value]) => String(row[key as keyof HistoryRow]) === String(value),
          ),
        );
      }

      async exec(): Promise<HistoryRow[]> {
        let data = this.matching();
        const keys = Object.keys(this.sortSpec);
        if (keys.length > 0) {
          data = [...data].sort((a, b) => {
            for (const key of keys) {
              const dir = this.sortSpec[key];
              const av = a[key as keyof HistoryRow];
              const bv = b[key as keyof HistoryRow];
              if (av === bv) continue;
              return av > bv ? dir : -dir;
            }
            return 0;
          });
        }
        const end =
          this.limitCount === undefined
            ? data.length
            : this.skipCount + this.limitCount;
        return data.slice(this.skipCount, end);
      }
    }

    function fakeApplicationModel(rows: HistoryRow[]) {
      return {
        find: jest.fn((filter: Record<string, unknown> = {}) => new FakeQuery(rows, filter)),
        countDocuments: jest.fn(
          async (filter: Record<string, unknown> = {}) =>
            rows.filter((row) =>
              Object.entries(filter).every(
                ([key, value]) =>
                  String(row[key as keyof HistoryRow]) === String(value),
              ),
            ).length,
        ),
      };
    }

    /**
     * 250 applications, the first 50 of which share one `createdAt` value —
     * exactly like a burst of submissions handled inside the same
     * millisecond.
     */
    function buildHistory(total: number, tiedAt: number): HistoryRow[] {
      const rows: HistoryRow[] = [];
      for (let i = 0; i < total; i++) {
        rows.push({
          _id: `app-${String(i).padStart(4, '0')}`,
          applicantId: 'student-1',
          createdAt:
            i < tiedAt
              ? '2026-01-01T00:00:00.000Z'
              : new Date(
                  Date.UTC(2026, 0, 1) + (i - tiedAt + 1) * 60_000,
                ).toISOString(),
        });
      }
      return rows;
    }

    async function makeServiceWithHistory(rows: HistoryRow[]) {
      const model = fakeApplicationModel(rows);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ScholarshipApplicationsService,
          { provide: getModelToken(ScholarshipApplication.name), useValue: model },
          { provide: getModelToken(ScholarshipProgram.name), useValue: programModel },
          { provide: getModelToken(ProgramTermsVersion.name), useValue: termsModel },
          { provide: PaginationService, useValue: new PaginationService() },
        ],
      }).compile();
      return module.get<ScholarshipApplicationsService>(
        ScholarshipApplicationsService,
      );
    }

    it('walks a 250-application history with no duplicates and no gaps', async () => {
      const history = buildHistory(250, 50);
      const paged = await makeServiceWithHistory(history);

      const seen: string[] = [];
      let page = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await paged.listMine('student-1', { page, limit: 25 });
        expect(result.page).toBe(page);
        expect(result.limit).toBe(25);
        // `total` counts the whole filtered collection, not the page.
        expect(result.total).toBe(250);
        if (result.data.length === 0) break;
        seen.push(...result.data.map((doc) => String(doc._id)));
        page += 1;
        if (page > 50) throw new Error('pagination did not terminate');
      }

      // No duplicates.
      expect(new Set(seen).size).toBe(seen.length);
      // No gaps: every stored application was returned exactly once.
      expect([...seen].sort()).toEqual(
        history.map((r) => r._id).sort(),
      );
    });

    it('returns the same page for a tied sort field on repeated calls', async () => {
      const history = buildHistory(120, 80);
      const paged = await makeServiceWithHistory(history);

      const first = await paged.listMine('student-1', { page: 2, limit: 40 });
      const second = await paged.listMine('student-1', { page: 2, limit: 40 });

      expect(second.data.map((d) => String(d._id))).toEqual(
        first.data.map((d) => String(d._id)),
      );
      // The 80 rows sharing one createdAt do not bleed across the page seam.
      expect(first.data).toHaveLength(40);
    });

    it('never leaks another applicant’s applications', async () => {
      const history = buildHistory(30, 5);
      const other: HistoryRow[] = buildHistory(10, 0).map((r) => ({
        ...r,
        _id: `other-${r._id}`,
        applicantId: 'student-2',
      }));
      const paged = await makeServiceWithHistory([...history, ...other]);

      const result = await paged.listMine('student-1', { page: 1, limit: 100 });

      expect(result.total).toBe(30);
      expect(
        result.data.every(
          (d) => (d as unknown as { applicantId: string }).applicantId === 'student-1',
        ),
      ).toBe(true);
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
        undefined,
        { createdAt: -1, _id: -1 },
      );
    });
  });
});