import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AlertType =
  | 'insolvency'
  | 'balance_drift'
  | 'ledger_integrity'
  | 'negative_balance'
  | 'payout_posting_failed';
export type AlertSeverity = 'critical' | 'warning';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type ReconciliationTrigger = 'manual' | 'scheduled' | 'pre_obligation';

export interface Discrepancy {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
}

/** Everything needed to recompute a run deterministically. */
export interface ReconciliationInputs {
  asOf: Date;
  ledgerEntryCount: number;
  lastEntryId: string | null;
  externalBalance: string;
  externalBalanceSource: 'horizon' | 'manual';
  externalObservedAt: Date;
  inFlightPayouts: string;
  inFlightPayoutCount: number;
}

/** All amounts are integer minor units as strings. */
export interface ReconciliationResults {
  ledgerTreasury: string;
  programFund: string;
  reserved: string;
  awardsPayable: string;
  liabilities: string;
  drift: string;
  explainedDrift: string;
  unexplainedDrift: string;
  solvencyMargin: string;
  trialBalanceDifference: string;
  unbalancedEntryIds: string[];
}

export type ReconciliationRunDocument = HydratedDocument<ReconciliationRun>;

/** Immutable record of one reconciliation. */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'scholarship_reconciliation_runs',
})
export class ReconciliationRun {
  @Prop({ required: true }) organizationId: string;
  @Prop({ required: true }) programId: string;
  @Prop({ required: true }) trigger: ReconciliationTrigger;
  @Prop({ required: true }) triggeredBy: string;
  @Prop({ required: true }) assetCode: string;
  @Prop({ type: Object, required: true }) inputs: ReconciliationInputs;
  @Prop({ type: Object, required: true }) results: ReconciliationResults;
  @Prop({ required: true, enum: ['balanced', 'discrepancies'] }) status:
    | 'balanced'
    | 'discrepancies';
  @Prop({ type: [Object], default: [] }) discrepancies: Discrepancy[];
  @Prop({ type: [String], default: [] }) alertIds: string[];
  createdAt?: Date;
}

export const ReconciliationRunSchema =
  SchemaFactory.createForClass(ReconciliationRun);
ReconciliationRunSchema.index({ programId: 1, createdAt: -1 });
ReconciliationRunSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  function () {
    throw new Error('Reconciliation runs are immutable');
  },
);

export type ReconciliationAlertDocument = HydratedDocument<ReconciliationAlert>;

/**
 * Operator-facing alert. Alerts never modify the ledger; resolving one only
 * records the operator's decision. Repeated detections of the same issue
 * update the one active alert (occurrences, lastRunId) instead of spamming.
 */
@Schema({ timestamps: true, collection: 'scholarship_reconciliation_alerts' })
export class ReconciliationAlert {
  @Prop({ required: true, index: true }) organizationId: string;
  @Prop({ required: true }) programId: string;
  @Prop({ required: true }) type: AlertType;
  @Prop({ required: true }) severity: AlertSeverity;
  @Prop({ required: true, default: 'open' }) status: AlertStatus;
  /** `${programId}:${type}` while open/acknowledged; unset once resolved. */
  @Prop() activeKey?: string;
  /** Critical alerts block new reservations and awards until resolved. */
  @Prop({ required: true }) blocksObligations: boolean;
  @Prop({ required: true }) message: string;
  @Prop({ type: Object, default: {} }) details: Record<string, unknown>;
  @Prop() firstRunId?: string;
  @Prop() lastRunId?: string;
  @Prop({ required: true, default: 0 }) occurrences: number;
  @Prop({ required: true }) firstSeenAt: Date;
  @Prop({ required: true }) lastSeenAt: Date;
  @Prop() acknowledgedBy?: string;
  @Prop() acknowledgedAt?: Date;
  @Prop() resolvedBy?: string;
  @Prop() resolvedAt?: Date;
  @Prop() resolutionNote?: string;
}

export const ReconciliationAlertSchema =
  SchemaFactory.createForClass(ReconciliationAlert);
ReconciliationAlertSchema.index(
  { activeKey: 1 },
  { unique: true, sparse: true },
);
ReconciliationAlertSchema.index({ programId: 1, status: 1 });
