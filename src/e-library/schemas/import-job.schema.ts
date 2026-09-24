import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ImportJobDocument = HydratedDocument<ImportJob>;

export enum ImportJobStatus {
  PENDING = 'pending',
  VALIDATING = 'validating',
  IMPORTING = 'importing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ImportSource {
  CSV = 'csv',
  JSON = 'json',
}

@Schema({ timestamps: true, collection: 'library_import_jobs' })
export class ImportJob {
  @Prop({ required: true, unique: true, index: true })
  jobId: string;

  @Prop({ unique: true, sparse: true, index: true })
  idempotencyKey?: string;

  @Prop({ required: true, enum: ImportSource })
  source: ImportSource;

  @Prop({ required: true, enum: ImportJobStatus, default: ImportJobStatus.PENDING })
  status: ImportJobStatus;

  @Prop({ default: 0 })
  totalRows: number;

  @Prop({ default: 0 })
  validRows: number;

  @Prop({ default: 0 })
  invalidRows: number;

  @Prop({ trim: true, default: '' })
  errorReportUrl: string;

  @Prop({ type: Object, default: () => ({}) })
  resultSummary: Record<string, unknown>;

  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ImportJobSchema = SchemaFactory.createForClass(ImportJob);
ImportJobSchema.index({ jobId: 1 }, { unique: true });
ImportJobSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
