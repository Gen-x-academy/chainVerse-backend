import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
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
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

export function sha256Hex(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export const INTEGRITY_CONTENT_READER = 'IntegrityContentReader';
export const INTEGRITY_ALERT_NOTIFIER = 'IntegrityAlertNotifier';

export interface IntegrityContentReader {
  readContent(input: {
    editionId: string;
    renditionId: string;
  }): Promise<Buffer | null>;
}

export interface IntegrityAlertNotifier {
  notifyFailed(input: {
    editionId: string;
    renditionId: string;
    expectedSha256: string;
    actualSha256: string;
    reason: string;
  }): Promise<void>;
}

@Injectable()
export class RenditionIntegrityService {
  private readonly logger = new Logger(RenditionIntegrityService.name);

  constructor(
    @InjectModel(RenditionIntegrity.name)
    private readonly integrityModel: Model<RenditionIntegrityDocument>,
    @InjectModel(IntegrityJob.name)
    private readonly jobModel: Model<IntegrityJobDocument>,
    private readonly paginationService: PaginationService,
    @Inject(INTEGRITY_CONTENT_READER)
    private readonly contentReader: IntegrityContentReader,
    @Inject(INTEGRITY_ALERT_NOTIFIER)
    private readonly notifier: IntegrityAlertNotifier,
  ) {}

  async registerChecksum(input: {
    editionId: string;
    renditionId: string;
    sha256: string;
    sizeBytes: number;
  }): Promise<RenditionIntegrityDocument> {
    const sha256 = input.sha256.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new ValidationDomainException(
        'sha256 must be a 64-character hex digest',
        ErrorCode.VAL_INVALID_FORMAT,
      );
    }
    if (input.sizeBytes <= 0) {
      throw new ValidationDomainException(
        'sizeBytes must be greater than zero',
        ErrorCode.VAL_OUT_OF_RANGE,
      );
    }

    const existing = await this.integrityModel
      .findOne({
        editionId: input.editionId,
        renditionId: input.renditionId,
      })
      .exec();
    if (existing) {
      throw new ResourceConflictException(
        'A checksum is already registered for this rendition',
        ErrorCode.BIZ_RENDITION_ALREADY_REGISTERED,
      );
    }

    return this.integrityModel.create({
      editionId: input.editionId,
      renditionId: input.renditionId,
      sha256,
      sizeBytes: input.sizeBytes,
      status: RenditionIntegrityStatus.UNVERIFIED,
    });
  }

  async listRenditions(
    filters: {
      status?: RenditionIntegrityStatus;
      editionId?: string;
      renditionId?: string;
    },
    pagination?: PaginationDto,
  ) {
    const filter: Record<string, unknown> = {};
    if (filters.status) filter.status = filters.status;
    if (filters.editionId) filter.editionId = filters.editionId;
    if (filters.renditionId) filter.renditionId = filters.renditionId;

    if (pagination) {
      return this.paginationService.paginate(this.integrityModel, pagination, filter);
    }
    return this.integrityModel.find(filter).sort({ updatedAt: -1 }).exec();
  }

  async getRendition(renditionId: string): Promise<RenditionIntegrityDocument> {
    const record = await this.integrityModel
      .findOne({ renditionId })
      .exec();
    if (!record) {
      throw new ResourceNotFoundException(
        'No integrity record for this rendition',
        ErrorCode.RES_RENDITION_INTEGRITY_NOT_FOUND,
      );
    }
    return record;
  }

  async isQuarantined(renditionId: string): Promise<boolean> {
    const record = await this.integrityModel.findOne({ renditionId }).exec();
    return record?.status === RenditionIntegrityStatus.QUARANTINED;
  }

  async assertNotQuarantined(
    renditionId: string,
    reason = 'Rendition is quarantined pending integrity review',
  ): Promise<void> {
    const record = await this.integrityModel.findOne({ renditionId }).exec();
    if (record?.status === RenditionIntegrityStatus.QUARANTINED) {
      throw new ResourceConflictException(
        reason,
        ErrorCode.BIZ_RENDITION_QUARANTINED,
      );
    }
  }

  async quarantineRendition(
    renditionId: string,
    reason?: string,
  ): Promise<RenditionIntegrityDocument> {
    const record = await this.integrityModel.findOne({ renditionId }).exec();
    if (!record) {
      throw new ResourceNotFoundException(
        'No integrity record for this rendition',
        ErrorCode.RES_RENDITION_INTEGRITY_NOT_FOUND,
      );
    }
    if (record.status === RenditionIntegrityStatus.QUARANTINED) {
      throw new ResourceConflictException(
        'Rendition is already quarantined',
        ErrorCode.BIZ_RENDITION_ALREADY_QUARANTINED,
      );
    }
    return this.integrityModel
      .findOneAndUpdate(
        { renditionId },
        {
          $set: {
            status: RenditionIntegrityStatus.QUARANTINED,
            quarantinedAt: new Date(),
            quarantinedReason: reason ?? 'Manual quarantine by staff',
            clearedAt: null,
            lastFailureReason: reason ?? 'Manual quarantine by staff',
          },
        },
        { new: true },
      )
      .exec() as unknown as Promise<RenditionIntegrityDocument>;
  }

  async resolveQuarantine(
    renditionId: string,
    resolution: 'confirmed' | 'reseeded',
    newSha256?: string,
  ): Promise<RenditionIntegrityDocument> {
    const record = await this.integrityModel.findOne({ renditionId }).exec();
    if (!record) {
      throw new ResourceNotFoundException(
        'No integrity record for this rendition',
        ErrorCode.RES_RENDITION_INTEGRITY_NOT_FOUND,
      );
    }
    if (record.status !== RenditionIntegrityStatus.QUARANTINED) {
      throw new ResourceConflictException(
        'Rendition is not quarantined',
        ErrorCode.BIZ_RENDITION_NOT_QUARANTINED,
      );
    }

    if (resolution === 'reseeded') {
      if (!newSha256 || !/^[0-9a-f]{64}$/i.test(newSha256)) {
        throw new ValidationDomainException(
          'A 64-character hex sha256 is required when reseeding a quarantined rendition',
          ErrorCode.VAL_MISSING_FIELD,
        );
      }
      return this.integrityModel
        .findOneAndUpdate(
          { renditionId, status: RenditionIntegrityStatus.QUARANTINED },
          {
            $set: {
              sha256: newSha256.toLowerCase(),
              status: RenditionIntegrityStatus.UNVERIFIED,
              clearedAt: new Date(),
              quarantinedAt: null,
              quarantinedReason: null,
              lastFailureReason: null,
            },
          },
          { new: true },
        )
        .exec() as unknown as Promise<RenditionIntegrityDocument>;
    }

    return this.integrityModel
      .findOneAndUpdate(
        { renditionId, status: RenditionIntegrityStatus.QUARANTINED },
        {
          $set: {
            status: RenditionIntegrityStatus.CLEARED,
            clearedAt: new Date(),
            quarantinedAt: null,
            quarantinedReason: null,
            lastFailureReason: null,
          },
        },
        { new: true },
      )
      .exec() as unknown as Promise<RenditionIntegrityDocument>;
  }

  async runIntegrityPass(
    batchSize = 50,
  ): Promise<IntegrityJobDocument> {
    if (batchSize < 1 || batchSize > 1000) {
      throw new ValidationDomainException(
        'batchSize must be between 1 and 1000',
        ErrorCode.VAL_OUT_OF_RANGE,
      );
    }

    const resumed = await this.jobModel
      .findOne({ status: IntegrityJobStatus.RUNNING })
      .sort({ startedAt: -1 })
      .exec();
    const lastCompleted = resumed
      ? null
      : await this.jobModel
          .findOne({ status: IntegrityJobStatus.COMPLETED })
          .sort({ finishedAt: -1 })
          .exec();

    const cursor = (resumed ?? lastCompleted)?.cursor;

    const job =
      resumed ??
      (await this.jobModel.create([
        {
          status: IntegrityJobStatus.RUNNING,
          batchSize,
          startedAt: new Date(),
          ...(cursor ? { cursor } : {}),
        },
      ]))[0];

    const filter: Record<string, unknown> = {};
    if (job.cursor) {
      if (!Types.ObjectId.isValid(job.cursor)) {
        await this.failJob(job, 'Stored cursor is not a valid ObjectId');
        throw new ValidationDomainException(
          'Stored cursor is not a valid ObjectId',
          ErrorCode.VAL_INVALID_INPUT,
        );
      }
      filter._id = { $gt: new Types.ObjectId(job.cursor) };
    }

    const effectiveBatchSize = job.batchSize ?? batchSize;

    let scannedCount = 0;
    let passedCount = 0;
    let quarantinedCount = 0;
    let skippedCount = 0;
    let lastId: Types.ObjectId | null = null;

    try {
      const candidates = await this.integrityModel
        .find(filter)
        .sort({ _id: 1 })
        .limit(effectiveBatchSize)
        .exec();

      for (const record of candidates) {
        lastId = record._id;
        scannedCount += 1;

        if (record.status === RenditionIntegrityStatus.QUARANTINED) {
          skippedCount += 1;
          continue;
        }

        const content = await this.contentReader.readContent({
          editionId: record.editionId,
          renditionId: record.renditionId,
        });
        if (content === null) {
          skippedCount += 1;
          continue;
        }

        const actualSha256 = sha256Hex(content);
        if (actualSha256 === record.sha256) {
          passedCount += 1;
          await this.integrityModel
            .updateOne(
              { _id: record._id, status: { $ne: RenditionIntegrityStatus.QUARANTINED } },
              {
                $set: {
                  status: RenditionIntegrityStatus.PASSED,
                  lastVerifiedAt: new Date(),
                  actualSha256,
                  lastFailureReason: null,
                },
              },
            )
            .exec();
        } else {
          quarantinedCount += 1;
          await this.integrityModel
            .updateOne(
              { _id: record._id },
              {
                $set: {
                  status: RenditionIntegrityStatus.QUARANTINED,
                  quarantinedAt: new Date(),
                  quarantinedReason: 'Checksum mismatch during integrity pass',
                  lastVerifiedAt: new Date(),
                  actualSha256,
                  lastFailureReason: `Expected sha256 ${record.sha256} but verified ${actualSha256}`,
                },
              },
            )
            .exec();
          await this.notifier.notifyFailed({
            editionId: record.editionId,
            renditionId: record.renditionId,
            expectedSha256: record.sha256,
            actualSha256,
            reason: 'Checksum mismatch during integrity pass',
          });
        }
      }

      const scanned = job.scannedCount + scannedCount;
      const passed = job.passedCount + passedCount;
      const quarantined = job.quarantinedCount + quarantinedCount;
      const skipped = job.skippedCount + skippedCount;

      const finished = candidates.length < effectiveBatchSize;
      await this.jobModel
        .updateOne(
          { _id: job._id },
          {
            $set: {
              status: finished
                ? IntegrityJobStatus.COMPLETED
                : IntegrityJobStatus.RUNNING,
              scannedCount: scanned,
              passedCount: passed,
              quarantinedCount: quarantined,
              skippedCount: skipped,
              ...(finished
                ? { finishedAt: new Date() }
                : lastId
                  ? { cursor: lastId.toString() }
                  : {}),
            },
          },
        )
        .exec();

      const updated = (await this.jobModel.findById(job._id).exec()) ?? job;
      return updated;
    } catch (error) {
      await this.failJob(
        job,
        error instanceof Error ? error.message : String(error),
      );
      this.logger.error(
        `Integrity pass aborted: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  listJobs(filters: { status?: IntegrityJobStatus }, pagination?: PaginationDto) {
    const filter: Record<string, unknown> = {};
    if (filters.status) filter.status = filters.status;

    if (pagination) {
      return this.paginationService.paginate(this.jobModel, pagination, filter);
    }
    return this.jobModel.find(filter).sort({ startedAt: -1 }).limit(100).exec();
  }

  async getJob(jobId: string): Promise<IntegrityJobDocument> {
    if (!Types.ObjectId.isValid(jobId)) {
      throw new ResourceNotFoundException(
        'Integrity job not found',
        ErrorCode.RES_INTEGRITY_JOB_NOT_FOUND,
      );
    }
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) {
      throw new ResourceNotFoundException(
        'Integrity job not found',
        ErrorCode.RES_INTEGRITY_JOB_NOT_FOUND,
      );
    }
    return job;
  }

  private async failJob(
    job: IntegrityJobDocument,
    message: string,
  ): Promise<void> {
    await this.jobModel
      .updateOne(
        { _id: job._id },
        {
          $set: {
            status: IntegrityJobStatus.FAILED,
            lastError: message,
            finishedAt: new Date(),
          },
        },
      )
      .exec();
  }
}

@Injectable()
export class NoopIntegrityContentReader implements IntegrityContentReader {
  private readonly logger = new Logger(NoopIntegrityContentReader.name);

  async readContent(): Promise<Buffer | null> {
    this.logger.warn(
      'NoRenditionContentReader: no storage adapter is bound, so renditions are unverifiable. Bind an IntegrityContentReader to the rendition storage layer.',
    );
    return null;
  }
}

@Injectable()
export class LoggerIntegrityAlertNotifier implements IntegrityAlertNotifier {
  private readonly logger = new Logger(LoggerIntegrityAlertNotifier.name);

  async notifyFailed(input: {
    editionId: string;
    renditionId: string;
    expectedSha256: string;
    actualSha256: string;
    reason: string;
  }): Promise<void> {
    this.logger.error(
      `Rendition integrity failure — edition=${input.editionId} rendition=${input.renditionId} expected=${input.expectedSha256} actual=${input.actualSha256} reason=${input.reason}`,
    );
  }
}