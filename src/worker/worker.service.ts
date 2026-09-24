import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReadStream } from 'node:fs';
import { UploadWorkerFileDto } from './dto/upload-worker-file.dto';
import { SERVABLE_STATUSES, UploadStatus } from './upload.constants';
import { sanitizeOriginalName, validateUploadedFile } from './file-validation';
import { FileStorageService, StorageArea } from './file-storage.service';
import {
  MalwareScannerService,
  ScanResult,
  ScanVerdict,
} from './malware-scanner.service';
import {
  WorkerUpload,
  WorkerUploadDocument,
} from './schemas/worker-upload.schema';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction, AuditOutcome } from '../common/audit/audit-action.enum';
import {
  AuditContext,
  systemAuditContext,
} from '../common/audit/audit-context';
import { Role } from '../common/enums/role.enum';

/** In-memory multer file handed over by the controller. */
export interface UploadedFileBuffer {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer: Buffer;
}

/** Public view of an upload — never exposes the storage path. */
export interface UploadView {
  id: string;
  status: string;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
  title: string | null;
  description: string | null;
  tags: string[];
  scan: {
    verdict: string;
    signature: string | null;
    engine: string;
    scannedAt: Date;
  } | null;
  /** Present only once the file has been released. */
  downloadUrl: string | null;
  uploadedAt: string;
}

const TARGET_TYPE = 'worker_upload';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    @InjectModel(WorkerUpload.name)
    private readonly uploadModel: Model<WorkerUploadDocument>,
    private readonly storage: FileStorageService,
    private readonly scanner: MalwareScannerService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Full upload lifecycle: validate → quarantine → scan → release or reject.
   *
   * The response never carries a download URL for a file that has not passed a
   * scan, and the bytes stay in the quarantine tree until they do.
   */
  async processUpload(
    file: UploadedFileBuffer,
    payload: UploadWorkerFileDto,
    ownerId: string,
    audit?: AuditContext,
  ): Promise<UploadView> {
    const context = audit ?? systemAuditContext();

    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File is required');
    }

    const maxBytes = this.maxFileBytes;
    if (file.buffer.length > maxBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the ${maxBytes} byte upload limit`,
      );
    }

    // Declared content type, filename extension and magic bytes must agree.
    const validation = validateUploadedFile(
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    if (!validation.valid || !validation.type || !validation.extension) {
      await this.auditService.record({
        action: AuditAction.FILE_UPLOAD_REJECTED,
        context,
        target: { type: TARGET_TYPE, id: null },
        outcome: AuditOutcome.DENIED,
        after: {
          originalName: sanitizeOriginalName(file.originalname),
          declaredMimeType: file.mimetype ?? null,
          size: file.buffer.length,
        },
        reason: validation.reason ?? 'Failed upload validation',
      });
      throw new BadRequestException(
        validation.reason ?? 'File failed validation',
      );
    }

    await this.assertWithinQuota(ownerId, file.buffer.length);

    const stored = await this.storage.storeInQuarantine(
      file.buffer,
      validation.extension,
    );

    const upload = await new this.uploadModel({
      ownerId,
      storageKey: stored.storageKey,
      storageArea: StorageArea.QUARANTINE,
      originalName: sanitizeOriginalName(file.originalname),
      mimeType: validation.type.mimeType,
      size: stored.size,
      sha256: stored.sha256,
      status: UploadStatus.PENDING,
      title: payload?.title ?? null,
      description: payload?.description ?? null,
      tags: parseTags(payload?.tags),
      quarantinedAt: new Date(),
    }).save();

    await this.auditService.record({
      action: AuditAction.FILE_UPLOAD_QUARANTINED,
      context,
      target: { type: TARGET_TYPE, id: upload.id },
      before: null,
      after: {
        storageArea: StorageArea.QUARANTINE,
        status: UploadStatus.PENDING,
        originalName: upload.originalName,
        mimeType: upload.mimeType,
        size: upload.size,
        sha256: upload.sha256,
      },
    });

    return this.toView(await this.scanAndSettle(upload, file.buffer, context));
  }

  /**
   * Scans quarantined bytes and applies the verdict.
   *
   * - clean → moved to the clean area and released
   * - infected → deleted, or moved to `infected/` when
   *   `UPLOAD_RETAIN_INFECTED=true`
   * - error → left in quarantine and unavailable (fails closed)
   */
  private async scanAndSettle(
    upload: WorkerUploadDocument,
    buffer: Buffer,
    context: AuditContext,
  ): Promise<WorkerUploadDocument> {
    upload.status = UploadStatus.SCANNING;
    await upload.save();

    const result = await this.scanner.scan(buffer, upload.storageKey);
    upload.scan = toScanRecord(result);

    if (result.verdict === ScanVerdict.CLEAN) {
      await this.storage.move(
        upload.storageKey,
        StorageArea.QUARANTINE,
        StorageArea.CLEAN,
      );
      upload.storageArea = StorageArea.CLEAN;
      upload.status = UploadStatus.CLEAN;
      upload.releasedAt = new Date();
    } else if (result.verdict === ScanVerdict.INFECTED) {
      if (this.retainInfected) {
        await this.storage.move(
          upload.storageKey,
          StorageArea.QUARANTINE,
          StorageArea.INFECTED,
        );
        upload.storageArea = StorageArea.INFECTED;
      } else {
        await this.storage.remove(upload.storageKey, StorageArea.QUARANTINE);
      }
      upload.status = UploadStatus.INFECTED;
    } else {
      // No verdict: keep the bytes quarantined and unavailable.
      upload.status = UploadStatus.ERROR;
    }

    await upload.save();

    await this.auditService.record({
      action: AuditAction.FILE_UPLOAD_SCANNED,
      context,
      target: { type: TARGET_TYPE, id: upload.id },
      outcome:
        result.verdict === ScanVerdict.CLEAN
          ? AuditOutcome.SUCCESS
          : AuditOutcome.FAILURE,
      before: { status: UploadStatus.PENDING },
      after: {
        status: upload.status,
        storageArea: upload.storageArea,
        verdict: result.verdict,
        signature: result.signature,
        engine: result.engine,
        sha256: upload.sha256,
      },
      reason: result.signature ?? result.details ?? null,
    });

    if (upload.status === UploadStatus.CLEAN) {
      await this.auditService.record({
        action: AuditAction.FILE_UPLOAD_RELEASED,
        context,
        target: { type: TARGET_TYPE, id: upload.id },
        before: { status: UploadStatus.SCANNING },
        after: { status: UploadStatus.CLEAN, storageArea: StorageArea.CLEAN },
      });
    }

    return upload;
  }

  /** Metadata for a single upload. Owner or platform admin only. */
  async getUpload(
    id: string,
    requesterId: string,
    requesterRole?: string,
  ): Promise<UploadView> {
    return this.toView(await this.loadOwned(id, requesterId, requesterRole));
  }

  async listUploads(ownerId: string): Promise<UploadView[]> {
    const uploads = await this.uploadModel
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
    return uploads.map((upload) => this.toView(upload));
  }

  /**
   * Opens a read stream for a released file.
   *
   * Anything short of {@link UploadStatus.CLEAN} is refused with 409 — this is
   * the check that makes "unavailable until scanned" real.
   */
  async openDownload(
    id: string,
    requesterId: string,
    requesterRole?: string,
  ): Promise<{ stream: ReadStream; upload: WorkerUploadDocument }> {
    const upload = await this.loadOwned(id, requesterId, requesterRole);

    if (!SERVABLE_STATUSES.includes(upload.status)) {
      throw new ConflictException(
        `File is not available for download (status: ${upload.status})`,
      );
    }

    if (!(await this.storage.exists(upload.storageKey, StorageArea.CLEAN))) {
      throw new NotFoundException('File contents are no longer available');
    }

    return {
      stream: this.storage.createReadStream(
        upload.storageKey,
        StorageArea.CLEAN,
      ),
      upload,
    };
  }

  async deleteUpload(
    id: string,
    requesterId: string,
    requesterRole?: string,
    audit?: AuditContext,
  ): Promise<{ id: string; deleted: boolean }> {
    const upload = await this.loadOwned(id, requesterId, requesterRole);

    await this.storage.remove(upload.storageKey, upload.storageArea);
    await this.uploadModel.findByIdAndDelete(upload.id).exec();

    await this.auditService.record({
      action: AuditAction.FILE_UPLOAD_DELETED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id: upload.id },
      before: {
        status: upload.status,
        storageArea: upload.storageArea,
        sha256: upload.sha256,
      },
      after: null,
    });

    return { id: upload.id, deleted: true };
  }

  private async loadOwned(
    id: string,
    requesterId: string,
    requesterRole?: string,
  ): Promise<WorkerUploadDocument> {
    const upload = await this.uploadModel.findById(id).exec();
    if (!upload) {
      throw new NotFoundException('Upload not found');
    }
    if (upload.ownerId !== requesterId && requesterRole !== Role.ADMIN) {
      // 404 rather than 403 so the endpoint does not confirm the id exists.
      throw new NotFoundException('Upload not found');
    }
    return upload;
  }

  /** Rejects uploads that would breach the per-user storage or count quota. */
  private async assertWithinQuota(
    ownerId: string,
    incomingBytes: number,
  ): Promise<void> {
    const windowMs = this.quotaWindowMs;
    const since = new Date(Date.now() - windowMs);

    const [countInWindow, aggregate] = await Promise.all([
      this.uploadModel
        .countDocuments({ ownerId, createdAt: { $gte: since } })
        .exec(),
      this.uploadModel
        .aggregate<{
          total: number;
        }>([
          { $match: { ownerId } },
          { $group: { _id: null, total: { $sum: '$size' } } },
        ])
        .exec(),
    ]);

    if (countInWindow >= this.quotaMaxFiles) {
      throw new ForbiddenException(
        `Upload quota exceeded: at most ${this.quotaMaxFiles} files per ${Math.round(
          windowMs / 1000,
        )}s`,
      );
    }

    const usedBytes = aggregate?.[0]?.total ?? 0;
    if (usedBytes + incomingBytes > this.quotaMaxBytes) {
      throw new ForbiddenException(
        `Storage quota exceeded: at most ${this.quotaMaxBytes} bytes per user`,
      );
    }
  }

  private toView(upload: WorkerUploadDocument): UploadView {
    const released = upload.status === UploadStatus.CLEAN;
    return {
      id: upload.id,
      status: upload.status,
      originalName: upload.originalName,
      mimeType: upload.mimeType,
      size: upload.size,
      sha256: upload.sha256,
      title: upload.title,
      description: upload.description,
      tags: upload.tags ?? [],
      scan: upload.scan
        ? {
            verdict: upload.scan.verdict,
            signature: upload.scan.signature,
            engine: upload.scan.engine,
            scannedAt: upload.scan.scannedAt,
          }
        : null,
      downloadUrl: released
        ? `/api/v1/worker/files/${upload.id}/content`
        : null,
      uploadedAt: (upload.createdAt ?? new Date()).toISOString(),
    };
  }

  get maxFileBytes(): number {
    return (
      this.configService.get<number>('uploads.maxFileBytes') ?? 5 * 1024 * 1024
    );
  }

  private get quotaMaxBytes(): number {
    return (
      this.configService.get<number>('uploads.quota.maxBytes') ??
      100 * 1024 * 1024
    );
  }

  private get quotaMaxFiles(): number {
    return this.configService.get<number>('uploads.quota.maxFiles') ?? 20;
  }

  private get quotaWindowMs(): number {
    return (
      this.configService.get<number>('uploads.quota.windowMs') ??
      24 * 60 * 60 * 1000
    );
  }

  private get retainInfected(): boolean {
    return this.configService.get<boolean>('uploads.retainInfected') === true;
  }
}

export function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function toScanRecord(result: ScanResult) {
  return {
    verdict: result.verdict,
    signature: result.signature,
    engine: result.engine,
    scannedAt: result.scannedAt,
    durationMs: result.durationMs,
    details: result.details,
  };
}
