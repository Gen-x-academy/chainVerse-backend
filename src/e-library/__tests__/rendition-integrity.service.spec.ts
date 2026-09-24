import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RenditionIntegrity,
  RenditionIntegrityDocument,
  RenditionIntegrityStatus,
} from '../schemas/rendition-integrity.schema';
import {
  IntegrityJob,
  IntegrityJobDocument,
  IntegrityJobStatus,
} from '../schemas/integrity-job.schema';
import { PaginationService } from '../../common/pagination/pagination.service';
import {
  RenditionIntegrityService,
  IntegrityContentReader,
  IntegrityAlertNotifier,
  sha256Hex,
  INTEGRITY_CONTENT_READER,
  INTEGRITY_ALERT_NOTIFIER,
} from '../services/rendition-integrity.service';
import { ErrorCode } from '../../common/errors/error-codes.enum';

describe('RenditionIntegrityService', () => {
  let service: RenditionIntegrityService;
  let integrityModel: jest.Mocked<Model<RenditionIntegrityDocument>>;
  let jobModel: jest.Mocked<Model<IntegrityJobDocument>>;
  let paginationService: jest.Mocked<PaginationService>;
  let contentReader: jest.Mocked<IntegrityContentReader>;
  let notifier: jest.Mocked<IntegrityAlertNotifier>;

  const goodHash = sha256Hex(Buffer.from('good'));
  const badHash = sha256Hex(Buffer.from('evil'));

  const makeRecord = (overrides: Record<string, unknown> = {}) => ({
    _id: '507f1f77bcf86cd799439031',
    editionId: 'edition-1',
    renditionId: 'rendition-1',
    sha256: goodHash,
    sizeBytes: 4,
    status: RenditionIntegrityStatus.UNVERIFIED,
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
    integrityModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      updateOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findById: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
    } as unknown as jest.Mocked<Model<RenditionIntegrityDocument>>;

    jobModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      updateOne: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<Model<IntegrityJobDocument>>;

    paginationService = {
      paginate: jest.fn(),
    } as unknown as jest.Mocked<PaginationService>;

    contentReader = {
      readContent: jest.fn(),
    };

    notifier = {
      notifyFailed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RenditionIntegrityService,
        { provide: getModelToken(RenditionIntegrity.name), useValue: integrityModel },
        { provide: getModelToken(IntegrityJob.name), useValue: jobModel },
        { provide: PaginationService, useValue: paginationService },
        { provide: INTEGRITY_CONTENT_READER, useValue: contentReader },
        { provide: INTEGRITY_ALERT_NOTIFIER, useValue: notifier },
      ],
    }).compile();

    service = module.get<RenditionIntegrityService>(RenditionIntegrityService);
  });

  it('computes a stable sha256 hex digest', () => {
    expect(sha256Hex(Buffer.from('good'))).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(Buffer.from('good'))).toBe(goodHash);
  });

  describe('registerChecksum', () => {
    const dto = {
      editionId: 'edition-1',
      renditionId: 'rendition-1',
      sha256: goodHash.toUpperCase(),
      sizeBytes: 4,
    };

    it('rejects a malformed checksum', async () => {
      await expect(
        service.registerChecksum({ ...dto, sha256: 'not-a-hash' }),
      ).rejects.toMatchObject({ code: ErrorCode.VAL_INVALID_FORMAT });
    });

    it('rejects a non-positive size', async () => {
      await expect(
        service.registerChecksum({ ...dto, sizeBytes: 0 }),
      ).rejects.toMatchObject({ code: ErrorCode.VAL_OUT_OF_RANGE });
    });

    it('throws a conflict when a checksum is already registered', async () => {
      integrityModel.findOne.mockReturnValue(execResolved(makeRecord()) as never);

      await expect(service.registerChecksum(dto)).rejects.toMatchObject({
        code: ErrorCode.BIZ_RENDITION_ALREADY_REGISTERED,
      });
    });

    it('creates an unverified record with a normalized lowercase checksum', async () => {
      integrityModel.findOne.mockReturnValue(execResolved(null) as never);
      integrityModel.create.mockResolvedValue(makeRecord() as never);

      await service.registerChecksum(dto);

      expect(integrityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sha256: goodHash,
          status: RenditionIntegrityStatus.UNVERIFIED,
        }),
      );
    });
  });

  describe('quarantine access control', () => {
    it('reports a quarantined rendition', async () => {
      integrityModel.findOne.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.QUARANTINED })) as never,
      );

      await expect(service.isQuarantined('rendition-1')).resolves.toBe(true);
    });

    it('does not report a passed rendition as quarantined', async () => {
      integrityModel.findOne.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.PASSED })) as never,
      );

      await expect(service.isQuarantined('rendition-1')).resolves.toBe(false);
    });

    it('blocks access to a quarantined rendition', async () => {
      integrityModel.findOne.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.QUARANTINED })) as never,
      );

      await expect(service.assertNotQuarantined('rendition-1')).rejects.toMatchObject({
        code: ErrorCode.BIZ_RENDITION_QUARANTINED,
      });
    });

    it('allows access when no integrity record exists', async () => {
      integrityModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(service.assertNotQuarantined('rendition-1')).resolves.toBeUndefined();
    });
  });

  describe('quarantineRendition', () => {
    it('throws not-found for an unknown rendition', async () => {
      integrityModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(service.quarantineRendition('rendition-x')).rejects.toMatchObject({
        code: ErrorCode.RES_RENDITION_INTEGRITY_NOT_FOUND,
      });
    });

    it('throws a conflict when already quarantined', async () => {
      integrityModel.findOne.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.QUARANTINED })) as never,
      );

      await expect(service.quarantineRendition('rendition-1')).rejects.toMatchObject({
        code: ErrorCode.BIZ_RENDITION_ALREADY_QUARANTINED,
      });
    });

    it('quarantines an active rendition', async () => {
      integrityModel.findOne.mockReturnValue(execResolved(makeRecord()) as never);
      integrityModel.findOneAndUpdate.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.QUARANTINED })) as never,
      );

      const result = await service.quarantineRendition('rendition-1', 'bad file');

      expect(result.status).toBe(RenditionIntegrityStatus.QUARANTINED);
      expect(integrityModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('resolveQuarantine', () => {
    it('throws not-found for an unknown rendition', async () => {
      integrityModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(
        service.resolveQuarantine('rendition-x', 'confirmed'),
      ).rejects.toMatchObject({ code: ErrorCode.RES_RENDITION_INTEGRITY_NOT_FOUND });
    });

    it('throws a conflict when the rendition is not quarantined', async () => {
      integrityModel.findOne.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.PASSED })) as never,
      );

      await expect(
        service.resolveQuarantine('rendition-1', 'confirmed'),
      ).rejects.toMatchObject({ code: ErrorCode.BIZ_RENDITION_NOT_QUARANTINED });
    });

    it('requires a checksum when reseeding', async () => {
      integrityModel.findOne.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.QUARANTINED })) as never,
      );

      await expect(
        service.resolveQuarantine('rendition-1', 'reseeded'),
      ).rejects.toMatchObject({ code: ErrorCode.VAL_MISSING_FIELD });
    });

    it('clears the quarantine when confirmed', async () => {
      integrityModel.findOne.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.QUARANTINED })) as never,
      );
      integrityModel.findOneAndUpdate.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.CLEARED })) as never,
      );

      const result = await service.resolveQuarantine('rendition-1', 'confirmed');

      expect(result.status).toBe(RenditionIntegrityStatus.CLEARED);
    });

    it('reseeds a corrected checksum back to unverified', async () => {
      integrityModel.findOne.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.QUARANTINED })) as never,
      );
      integrityModel.findOneAndUpdate.mockReturnValue(
        execResolved(makeRecord({ status: RenditionIntegrityStatus.UNVERIFIED })) as never,
      );

      const result = await service.resolveQuarantine('rendition-1', 'reseeded', badHash);

      expect(result.status).toBe(RenditionIntegrityStatus.UNVERIFIED);
      expect(integrityModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ sha256: badHash }),
        }),
        { new: true },
      );
    });
  });

  describe('runIntegrityPass', () => {
    const runningJob = {
      _id: 'job-1',
      status: IntegrityJobStatus.RUNNING,
      batchSize: 50,
      scannedCount: 0,
      passedCount: 0,
      quarantinedCount: 0,
      skippedCount: 0,
      startedAt: new Date(),
    };

    const setupFreshJob = () => {
      jobModel.findOne.mockReturnValue(queryChain(null) as never);
      jobModel.create.mockResolvedValue([{ ...runningJob }] as never);
      jobModel.updateOne.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);
      jobModel.findById.mockReturnValue(
        execResolved({ ...runningJob, status: IntegrityJobStatus.COMPLETED }) as never,
      );
    };

    it('marks matching renditions passed and completes a short batch', async () => {
      setupFreshJob();
      const records = [makeRecord(), makeRecord({ _id: '507f1f77bcf86cd799439032' })];
      integrityModel.find.mockReturnValue(queryChain(records) as never);
      integrityModel.updateOne.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);
      contentReader.readContent.mockResolvedValue(Buffer.from('good'));

      await service.runIntegrityPass(50);

      const passedUpdates = integrityModel.updateOne.mock.calls.filter(
        (call) => (call[1] as any).$set.status === RenditionIntegrityStatus.PASSED,
      );
      expect(passedUpdates).toHaveLength(2);
      const jobUpdate = jobModel.updateOne.mock.calls[0][1] as any;
      expect(jobUpdate.$set.status).toBe(IntegrityJobStatus.COMPLETED);
      expect(jobUpdate.$set.passedCount).toBe(2);
    });

    it('keeps the job running and stores a cursor when the batch is exactly full', async () => {
      setupFreshJob();
      const records = [
        makeRecord(),
        makeRecord({ _id: '507f1f77bcf86cd799439032' }),
      ];
      integrityModel.find.mockReturnValue(queryChain(records) as never);
      integrityModel.updateOne.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);
      contentReader.readContent.mockResolvedValue(Buffer.from('good'));

      await service.runIntegrityPass(2);

      const jobUpdate = jobModel.updateOne.mock.calls[0][1] as any;
      expect(jobUpdate.$set.status).toBe(IntegrityJobStatus.RUNNING);
      expect(jobUpdate.$set.cursor).toBe('507f1f77bcf86cd799439032');
    });

    it('quarantines a mismatched rendition, alerts staff, and never deletes content', async () => {
      setupFreshJob();
      const records = [makeRecord()];
      integrityModel.find.mockReturnValue(queryChain(records) as never);
      integrityModel.updateOne.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);
      contentReader.readContent.mockResolvedValue(Buffer.from('evil'));

      await service.runIntegrityPass(50);

      const quarantineUpdate = integrityModel.updateOne.mock.calls.find(
        (call) => (call[1] as any).$set.status === RenditionIntegrityStatus.QUARANTINED,
      );
      expect(quarantineUpdate).toBeDefined();
      expect(notifier.notifyFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          renditionId: 'rendition-1',
          expectedSha256: goodHash,
          actualSha256: badHash,
        }),
      );
      expect(integrityModel.deleteOne).not.toHaveBeenCalled();
      expect(integrityModel.deleteMany).not.toHaveBeenCalled();
    });

    it('skips already-quarantined renditions', async () => {
      setupFreshJob();
      const records = [makeRecord({ status: RenditionIntegrityStatus.QUARANTINED })];
      integrityModel.find.mockReturnValue(queryChain(records) as never);
      integrityModel.updateOne.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);

      await service.runIntegrityPass(50);

      expect(contentReader.readContent).not.toHaveBeenCalled();
      const jobUpdate = jobModel.updateOne.mock.calls[0][1] as any;
      expect(jobUpdate.$set.skippedCount).toBe(1);
    });

    it('skips renditions whose content cannot be read', async () => {
      setupFreshJob();
      const records = [makeRecord()];
      integrityModel.find.mockReturnValue(queryChain(records) as never);
      integrityModel.updateOne.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);
      contentReader.readContent.mockResolvedValue(null);

      await service.runIntegrityPass(50);

      const jobUpdate = jobModel.updateOne.mock.calls[0][1] as any;
      expect(jobUpdate.$set.skippedCount).toBe(1);
      expect(jobUpdate.$set.passedCount).toBe(0);
    });

    it('resumes an in-progress job from its cursor without creating a new job', async () => {
      const cursor = '507f1f77bcf86cd799439099';
      jobModel.findOne.mockReturnValue(queryChain({ ...runningJob, cursor }) as never);
      integrityModel.find.mockReturnValue(queryChain([]) as never);
      jobModel.updateOne.mockReturnValue(execResolved({ modifiedCount: 1 }) as never);
      jobModel.findById.mockReturnValue(execResolved({ ...runningJob }) as never);

      await service.runIntegrityPass(50);

      expect(jobModel.create).not.toHaveBeenCalled();
      expect(integrityModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ _id: { $gt: expect.anything() } }),
      );
    });

    it('marks the job failed and rethrows when content reading errors', async () => {
      setupFreshJob();
      integrityModel.find.mockReturnValue(queryChain([makeRecord()]) as never);
      contentReader.readContent.mockRejectedValue(new Error('storage down'));

      await expect(service.runIntegrityPass(50)).rejects.toThrow('storage down');

      const failUpdate = jobModel.updateOne.mock.calls.find(
        (call) => (call[1] as any).$set.status === IntegrityJobStatus.FAILED,
      );
      expect(failUpdate).toBeDefined();
    });

    it('rejects an out-of-range batch size', async () => {
      await expect(service.runIntegrityPass(0)).rejects.toMatchObject({
        code: ErrorCode.VAL_OUT_OF_RANGE,
      });
    });
  });

  describe('listRenditions', () => {
    it('delegates to the pagination service with a status filter', async () => {
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      await service.listRenditions(
        { status: RenditionIntegrityStatus.QUARANTINED },
        { page: 1, limit: 10 },
      );

      expect(paginationService.paginate).toHaveBeenCalledWith(
        integrityModel,
        { page: 1, limit: 10 },
        { status: RenditionIntegrityStatus.QUARANTINED },
      );
    });
  });

  describe('getRendition / getJob', () => {
    it('throws not-found for an unknown rendition', async () => {
      integrityModel.findOne.mockReturnValue(execResolved(null) as never);

      await expect(service.getRendition('rendition-x')).rejects.toMatchObject({
        code: ErrorCode.RES_RENDITION_INTEGRITY_NOT_FOUND,
      });
    });

    it('throws not-found for an unknown job', async () => {
      await expect(service.getJob('not-an-object-id')).rejects.toMatchObject({
        code: ErrorCode.RES_INTEGRITY_JOB_NOT_FOUND,
      });
    });
  });
});