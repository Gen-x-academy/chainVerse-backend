import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DisbursementRunDocument = HydratedDocument<DisbursementRun>;

export enum DisbursementRunKind {
  EXECUTE = 'execute',
  RECONCILE = 'reconcile',
}

export enum DisbursementRunTrigger {
  CRON = 'cron',
  AUTOMATION = 'automation',
}

/** Per-intent outcome codes. Each maps to exactly one payment. */
export enum IntentOutcome {
  SUBMITTED = 'submitted',
  PENDING = 'pending',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  EXPIRED = 'expired',
  SKIPPED_NO_VERIFIED_WALLET = 'skipped_no_verified_wallet',
  SKIPPED_ASSET_NOT_ACTIVE = 'skipped_asset_not_active',
  SKIPPED_DESTINATION_MISSING = 'skipped_destination_missing',
  SKIPPED_MISSING_TRUSTLINE = 'skipped_missing_trustline',
  SKIPPED_BATCH_HALTED = 'skipped_batch_halted',
  UNCHANGED = 'unchanged',
  EVIDENCE_MISMATCH = 'evidence_mismatch',
  ERROR = 'error',
}

export interface IntentResult {
  paymentId: string;
  organizationId: string;
  outcome: IntentOutcome;
  txHash: string | null;
  detail: string | null;
}

/** Record of one executor or reconciler batch and what happened to each intent. */
@Schema({ timestamps: true, collection: 'scholarship_disbursement_runs' })
export class DisbursementRun {
  @Prop({
    type: String,
    required: true,
    enum: Object.values(DisbursementRunKind),
  })
  kind: DisbursementRunKind;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(DisbursementRunTrigger),
  })
  trigger: DisbursementRunTrigger;

  /** Restricts the run to one organization when set. */
  @Prop({ type: String, default: null })
  organizationId: string | null;

  @Prop({ required: true })
  batchSize: number;

  @Prop({ required: true })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  finishedAt: Date | null;

  /** Why the batch stopped early, if it did. */
  @Prop({ type: String, default: null })
  haltReason: string | null;

  @Prop({ type: [Object], default: [] })
  results: IntentResult[];

  @Prop({ type: Object, default: {} })
  summary: Record<string, number>;
}

export const DisbursementRunSchema =
  SchemaFactory.createForClass(DisbursementRun);

// Run history is operational telemetry; the payments hold the durable state.
DisbursementRunSchema.index(
  { startedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);

export type DisbursementLockDocument = HydratedDocument<DisbursementLock>;

/**
 * Cluster-wide mutex for executor and reconciler runs. Payouts share one
 * treasury sequence number, so two executors submitting at once would reject
 * each other's transactions. `_id` is the lock name; a lock whose `until` has
 * passed is considered abandoned and may be taken over.
 */
@Schema({ collection: 'scholarship_disbursement_locks' })
export class DisbursementLock {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  holder: string;

  @Prop({ required: true })
  until: Date;
}

export const DisbursementLockSchema =
  SchemaFactory.createForClass(DisbursementLock);
