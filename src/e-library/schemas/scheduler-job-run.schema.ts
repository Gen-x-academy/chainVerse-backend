import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SchedulerJobRunDocument = HydratedDocument<SchedulerJobRun>;

// Observability log for scheduled jobs (overdue transition, reconciliation).
@Schema({ timestamps: true })
export class SchedulerJobRun {
  @Prop({ required: true })
  jobName: string;

  @Prop({ required: true })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  @Prop({ default: 0 })
  scannedCount: number;

  @Prop({ default: 0 })
  transitionedCount: number;

  @Prop({ default: 0 })
  errorCount: number;

  @Prop({
    type: String,
    enum: ['running', 'completed', 'failed'],
    default: 'running',
  })
  status: 'running' | 'completed' | 'failed';

  @Prop({ type: String, default: null })
  errorMessage: string | null;
}

export const SchedulerJobRunSchema =
  SchemaFactory.createForClass(SchedulerJobRun);
SchedulerJobRunSchema.index({ jobName: 1, startedAt: -1 });
