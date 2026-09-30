import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FinanceStatementDocument = HydratedDocument<FinanceStatement>;

/**
 * Lifecycle states for an asynchronously generated statement export.
 *
 * PENDING    – job queued; computation not yet started.
 * RUNNING    – aggregation and reconciliation in progress.
 * READY      – statement data is complete and available for download.
 * FAILED     – the job failed; `errorMessage` carries the reason.
 * EXPIRED    – the ready statement was not downloaded within the retention window
 *               and the data has been purged.
 */
export enum StatementExportStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  READY = 'ready',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

/**
 * One line item in the finance statement.
 *
 * Represents a single financial event — a contribution, commitment, payment,
 * fee, refund, or recovery — and its effect on the running balance.
 */
@Schema({ _id: false })
export class StatementLineItem {
  /** ISO 8601 date-time when the event was posted to the ledger. */
  @Prop({ required: true })
  occurredAt: Date;

  /**
   * Category of event. Values mirror LedgerSourceType from finance.enums.ts
   * plus additional human-readable aliases.
   */
  @Prop({ required: true, trim: true, maxlength: 80 })
  eventType: string;

  @Prop({ trim: true, maxlength: 300 })
  description?: string;

  /** Source document id (deposit id, refund id, reservation id, etc.). */
  @Prop({ required: true })
  sourceId: string;

  /** Human-readable source category (e.g. "Sponsor Deposit", "Award Disbursement"). */
  @Prop({ required: true, trim: true, maxlength: 80 })
  sourceType: string;

  /** Credit amount in minor currency units (0 when this line is a debit). */
  @Prop({ required: true, min: 0, default: 0 })
  creditMinor: number;

  /** Debit amount in minor currency units (0 when this line is a credit). */
  @Prop({ required: true, min: 0, default: 0 })
  debitMinor: number;

  /** Running balance after this event, in minor currency units. */
  @Prop({ required: true })
  runningBalanceMinor: number;

  /** ISO 4217 currency code for this line. */
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 10 })
  currency: string;
}

export const StatementLineItemSchema =
  SchemaFactory.createForClass(StatementLineItem);

/**
 * Persisted finance statement document.
 *
 * For short-range queries the statement is computed inline and stored as a
 * READY document immediately.  For large date ranges (> 90 days of data or
 * > 500 line items) the job runs asynchronously: the document is created as
 * PENDING, the job runs and updates it to READY, and the caller polls for
 * completion.
 *
 * Reconciliation:
 *   The `reconciled` flag is set by comparing:
 *     openingBalance + sum(creditMinors) - sum(debitMinors) == closingBalance
 *   If the equation does not hold within RECONCILE_TOLERANCE (0.01 minor units)
 *   the flag is false and `reconciliationNote` carries the discrepancy detail.
 *
 * Ownership:
 *   Scoped to `organizationId`; optionally to a single `programId`.
 *
 * Privacy:
 *   Statements may contain recipient-linked amounts.  Access is restricted to
 *   OWNER and ADMIN organisation roles.
 *
 * Migration:
 *   New collection `scholarship_finance_statements`.
 *   No existing data is affected.
 *   Statements older than `retentionDays` should be purged by a scheduled job.
 */
@Schema({ timestamps: true, collection: 'scholarship_finance_statements' })
export class FinanceStatement {
  /** Tenant scope. */
  @Prop({ required: true, index: true })
  organizationId: string;

  /** When set, the statement covers a single programme; otherwise all programmes. */
  @Prop({ type: String, default: null })
  programId: string | null;

  /** Inclusive start of the statement period (UTC). */
  @Prop({ required: true, index: true })
  periodStart: Date;

  /** Inclusive end of the statement period (UTC). */
  @Prop({ required: true, index: true })
  periodEnd: Date;

  @Prop({
    required: true,
    enum: StatementExportStatus,
    default: StatementExportStatus.PENDING,
    index: true,
  })
  status: StatementExportStatus;

  /** ISO 4217 currency code. All line items must share this currency. */
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 10 })
  currency: string;

  /** Opening balance (minor units) at the start of the period. */
  @Prop({ required: true, default: 0 })
  openingBalanceMinor: number;

  /** Closing balance (minor units) at the end of the period. */
  @Prop({ required: true, default: 0 })
  closingBalanceMinor: number;

  /** Sum of all credit entries in the period (minor units). */
  @Prop({ required: true, default: 0 })
  totalCreditsMinor: number;

  /** Sum of all debit entries in the period (minor units). */
  @Prop({ required: true, default: 0 })
  totalDebitsMinor: number;

  /** True when opening + credits - debits == closing within tolerance. */
  @Prop({ required: true, default: false })
  reconciled: boolean;

  /** Populated when `reconciled = false` with the discrepancy amount. */
  @Prop({ type: String, default: null })
  reconciliationNote: string | null;

  /** Ordered line items (populated only when status = READY). */
  @Prop({ type: [StatementLineItemSchema], default: [] })
  lineItems: StatementLineItem[];

  /** JWT `sub` of the user who requested the statement generation. */
  @Prop({ required: true })
  requestedBy: string;

  /** Timestamp when the statement job completed (READY or FAILED). */
  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  /** Error message when status = FAILED. */
  @Prop({ type: String, default: null, trim: true })
  errorMessage: string | null;

  /**
   * When the READY data will be purged.
   * Set to `completedAt + retentionDays` when the job finishes.
   * A scheduled job sets status = EXPIRED and clears `lineItems` after this date.
   */
  @Prop({ type: Date, default: null, index: true })
  expiresAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FinanceStatementSchema =
  SchemaFactory.createForClass(FinanceStatement);

FinanceStatementSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
FinanceStatementSchema.index({
  organizationId: 1,
  periodStart: 1,
  periodEnd: 1,
});
