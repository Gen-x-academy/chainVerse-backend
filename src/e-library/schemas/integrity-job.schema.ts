import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IntegrityJobDocument = HydratedDocument<IntegrityJob>;

export enum IntegrityJobStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({ timestamps: true, collection: 'library_integrity_jobs' })
export class IntegrityJob {
  @Prop({ required: true, enum: IntegrityJobStatus, default: IntegrityJobStatus.RUNNING, index: true })
  status: IntegrityJobStatus;

  @Prop({ required: true, min: 1, default: 50 })
  batchSize: number;

  @Prop()
  cursor?: string;

  @Prop({ default: 0 })
  scannedCount: number;

  @Prop({ default: 0 })
  passedCount: number;

  @Prop({ default: 0 })
  quarantinedCount: number;

  @Prop({ default: 0 })
  skippedCount: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  finishedAt?: Date;

  @Prop()
  lastError?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const IntegrityJobSchema = SchemaFactory.createForClass(IntegrityJob);
IntegrityJobSchema.index({ startedAt: -1 });