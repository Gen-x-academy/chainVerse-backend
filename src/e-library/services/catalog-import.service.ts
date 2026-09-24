import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  ImportJob,
  ImportJobDocument,
  ImportJobStatus,
} from '../schemas/import-job.schema';
import { ImportCatalogDto } from '../dto/import-catalog.dto';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  ResourceNotFoundException,
  BusinessRuleException,
} from '../../common/errors/domain.exception';

const MAX_IMPORT_ROWS = 10000;

@Injectable()
export class CatalogImportService {
  constructor(
    @InjectModel(ImportJob.name)
    private readonly importJobModel: Model<ImportJobDocument>,
  ) {}

  async startImport(dto: ImportCatalogDto, createdBy: string): Promise<ImportJobDocument> {
    if (dto.idempotencyKey) {
      const existing = await this.importJobModel.findOne({
        idempotencyKey: dto.idempotencyKey,
      }).exec();
      if (existing) {
        throw new BusinessRuleException(
          'An import with this idempotency key already exists',
          ErrorCode.BIZ_IMPORT_DUPLICATE_IDEMPOTENCY_KEY,
        );
      }
    }

    const jobId = randomUUID();

    const job = await this.importJobModel.create({
      jobId,
      idempotencyKey: dto.idempotencyKey,
      source: dto.source,
      status: ImportJobStatus.PENDING,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errorReportUrl: '',
      resultSummary: {},
      createdBy,
    });

    return job;
  }

  async validateAndImportRows(
    jobId: string,
    rows: Record<string, unknown>[],
  ): Promise<ImportJobDocument> {
    const job = await this.getImportJob(jobId);

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BusinessRuleException(
        `Import size exceeded: ${rows.length} rows provided, maximum is ${MAX_IMPORT_ROWS}`,
        ErrorCode.BIZ_IMPORT_SIZE_EXCEEDED,
      );
    }

    job.totalRows = rows.length;
    job.status = ImportJobStatus.VALIDATING;
    await job.save();

    const errors: Array<{ row: number; message: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.title || typeof row.title !== 'string') {
        errors.push({ row: i + 1, message: 'Missing or invalid "title" field' });
      }
      if (!row.author || typeof row.author !== 'string') {
        errors.push({ row: i + 1, message: 'Missing or invalid "author" field' });
      }
      if (!row.format || !['physical', 'ebook', 'audiobook'].includes(row.format as string)) {
        errors.push({ row: i + 1, message: 'Missing or invalid "format" field' });
      }
    }

    if (errors.length > 0) {
      job.invalidRows = errors.length;
      job.validRows = rows.length - errors.length;
      job.status = ImportJobStatus.FAILED;
      job.errorReportUrl = `/library/catalog/import/${jobId}/errors`;
      job.resultSummary = { errors };
      await job.save();
      return job;
    }

    job.status = ImportJobStatus.IMPORTING;
    await job.save();

    job.validRows = rows.length;
    job.status = ImportJobStatus.COMPLETED;
    job.resultSummary = { importedCount: rows.length };
    await job.save();

    return job;
  }

  async getImportStatus(jobId: string): Promise<ImportJobDocument> {
    return this.getImportJob(jobId);
  }

  async getImportJob(jobId: string): Promise<ImportJobDocument> {
    const job = await this.importJobModel.findOne({ jobId }).exec();
    if (!job) {
      throw new ResourceNotFoundException(
        'Import job not found',
        ErrorCode.RES_IMPORT_JOB_NOT_FOUND,
      );
    }
    return job;
  }
}
