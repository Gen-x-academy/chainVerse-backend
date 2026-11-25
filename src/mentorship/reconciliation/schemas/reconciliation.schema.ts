import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum ReconciliationRunStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
}

export enum CorrectionStatus {
  NONE = 'none',
  PROPOSED = 'proposed',
  SIGNED_OFF = 'signed_off',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true, collection: 'mentorship_reconciliation_runs' })
export class ReconciliationRun {
  @Prop({ required: true, unique: true }) idempotencyKey!: string;
  @Prop({ required: true }) periodLabel!: string;
  @Prop({ required: true }) startedBy!: string;
  @Prop({ type: String, enum: Object.values(ReconciliationRunStatus), default: ReconciliationRunStatus.RUNNING })
  status!: ReconciliationRunStatus;
  /** Last classification key fully persisted; a resumed run skips keys <= cursor. */
  @Prop({ type: String, default: null }) cursor!: string | null;
  @Prop({ default: 0 }) processed!: number;
  @Prop({ default: 0 }) mismatches!: number;
}
export type ReconciliationRunDocument = HydratedDocument<ReconciliationRun>;
export const ReconciliationRunSchema = SchemaFactory.createForClass(ReconciliationRun);

@Schema({ timestamps: true, collection: 'mentorship_reconciliation_mismatches' })
export class ReconciliationMismatch {
  @Prop({ required: true, index: true }) runId!: string;
  @Prop({ required: true }) key!: string;
  @Prop({ required: true }) type!: string;
  @Prop({ type: String, default: null }) internalRef!: string | null;
  @Prop({ type: String, default: null }) externalRef!: string | null;
  @Prop({ type: Number, default: null }) internalAmountMinor!: number | null;
  @Prop({ type: Number, default: null }) externalAmountMinor!: number | null;
  @Prop({ type: Number, default: null }) deltaMinor!: number | null;
  @Prop({ type: String, enum: Object.values(CorrectionStatus), default: CorrectionStatus.NONE })
  correctionStatus!: CorrectionStatus;
  @Prop({ type: String, default: null }) correctionNote!: string | null;
  @Prop({ type: String, default: null }) proposedBy!: string | null;
  @Prop({ type: String, default: null }) signedOffBy!: string | null;
  @Prop({ type: Date, default: null }) signedOffAt!: Date | null;
}
export type ReconciliationMismatchDocument = HydratedDocument<ReconciliationMismatch>;
export const ReconciliationMismatchSchema = SchemaFactory.createForClass(ReconciliationMismatch);
// Replays of the same run upsert on this key, so processing is idempotent.
ReconciliationMismatchSchema.index({ runId: 1, key: 1 }, { unique: true });
