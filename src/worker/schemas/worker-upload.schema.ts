import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { UploadStatus } from '../upload.constants';
import { StorageArea } from '../file-storage.service';

export type WorkerUploadDocument = HydratedDocument<WorkerUpload>;

export class UploadScanRecord {
  verdict: string;
  signature: string | null;
  engine: string;
  scannedAt: Date;
  durationMs: number;
  details?: string;
}

@Schema({ collection: 'worker_uploads', timestamps: true })
export class WorkerUpload {
  /** Authenticated uploader; quotas and reads are scoped to this. */
  @Prop({ required: true, index: true })
  ownerId: string;

  /** Generated storage name — never caller-supplied. */
  @Prop({ required: true, unique: true })
  storageKey: string;

  /** Which storage area currently holds the bytes. */
  @Prop({
    type: String,
    required: true,
    enum: Object.values(StorageArea),
    default: StorageArea.QUARANTINE,
  })
  storageArea: StorageArea;

  /** Sanitized original filename, kept for display only. */
  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  size: number;

  @Prop({ required: true })
  sha256: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(UploadStatus),
    default: UploadStatus.PENDING,
    index: true,
  })
  status: UploadStatus;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  scan: UploadScanRecord | null;

  @Prop({ type: String, default: null })
  title: string | null;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Date, default: null })
  releasedAt: Date | null;

  @Prop({ type: Date, default: null })
  quarantinedAt: Date | null;

  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export const WorkerUploadSchema = SchemaFactory.createForClass(WorkerUpload);

// Quota lookups: bytes and file counts per owner within a rolling window.
WorkerUploadSchema.index({ ownerId: 1, createdAt: -1 });
