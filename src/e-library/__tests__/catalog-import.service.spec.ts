import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CatalogImportService } from '../services/catalog-import.service';
import {
  ImportJob,
  ImportJobDocument,
  ImportJobStatus,
  ImportSource,
} from '../schemas/import-job.schema';
import { ImportCatalogDto } from '../dto/import-catalog.dto';
import {
  BusinessRuleException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';

describe('CatalogImportService', () => {
  let service: CatalogImportService;
  let importJobModel: jest.Mocked<Model<ImportJobDocument>>;

  const CREATED_BY = 'user-001';

  const mockJob = {
    _id: '507f1f77bcf86cd799439011',
    jobId: 'test-job-id',
    idempotencyKey: undefined as string | undefined,
    source: ImportSource.CSV,
    status: ImportJobStatus.PENDING,
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    errorReportUrl: '',
    resultSummary: {},
    createdBy: CREATED_BY,
    save: jest.fn().mockImplementation(function (this: any) {
      return Promise.resolve(this);
    }),
  };

  beforeEach(async () => {
    importJobModel = {
      create: jest.fn().mockResolvedValue({ ...mockJob, _id: '507f1f77bcf86cd799439011' }),
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogImportService,
        { provide: getModelToken(ImportJob.name), useValue: importJobModel },
      ],
    }).compile();

    service = module.get<CatalogImportService>(CatalogImportService);
  });

  describe('startImport', () => {
    it('should create a new import job', async () => {
      const dto: ImportCatalogDto = { source: ImportSource.CSV };
      const result = await service.startImport(dto, CREATED_BY);
      expect(result).toBeDefined();
      expect(importJobModel).toBeDefined();
    });

    it('should reject duplicate idempotency key', async () => {
      importJobModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockJob),
      });

      const dto: ImportCatalogDto = {
        source: ImportSource.CSV,
        idempotencyKey: 'dup-key',
      };

      await expect(service.startImport(dto, CREATED_BY)).rejects.toBeInstanceOf(
        BusinessRuleException,
      );
    });
  });

  describe('validateAndImportRows', () => {
    it('should complete import when all rows are valid', async () => {
      const job = {
        ...mockJob,
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      importJobModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(job),
      });

      const rows = [
        { title: 'Dune', author: 'Frank Herbert', format: 'physical' },
        { title: 'Neuromancer', author: 'William Gibson', format: 'ebook' },
      ];

      const result = await service.validateAndImportRows('test-job-id', rows);
      expect(result.status).toBe(ImportJobStatus.COMPLETED);
      expect(result.validRows).toBe(2);
      expect(result.invalidRows).toBe(0);
    });

    it('should fail when rows have validation errors', async () => {
      const job = {
        ...mockJob,
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      importJobModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(job),
      });

      const rows = [
        { title: 'Valid Book', author: 'Author', format: 'physical' },
        { author: 'Missing Title', format: 'ebook' },
      ];

      const result = await service.validateAndImportRows('test-job-id', rows);
      expect(result.status).toBe(ImportJobStatus.FAILED);
      expect(result.invalidRows).toBe(1);
      expect(result.errorReportUrl).toContain('errors');
    });

    it('should reject when row count exceeds 10000', async () => {
      const job = {
        ...mockJob,
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      importJobModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(job),
      });

      const rows = Array.from({ length: 10001 }, (_, i) => ({
        title: `Book ${i}`,
        author: 'Author',
        format: 'physical',
      }));

      await expect(
        service.validateAndImportRows('test-job-id', rows),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });
  });

  describe('getImportStatus', () => {
    it('should return the import job when found', async () => {
      importJobModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockJob),
      });

      const result = await service.getImportStatus('test-job-id');
      expect(result.jobId).toBe('test-job-id');
    });

    it('should throw ResourceNotFoundException when not found', async () => {
      importJobModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getImportStatus('nonexistent')).rejects.toBeInstanceOf(
        ResourceNotFoundException,
      );
    });
  });
});
