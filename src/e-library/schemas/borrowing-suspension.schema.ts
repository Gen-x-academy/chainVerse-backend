import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BorrowingSuspensionDocument = HydratedDocument<BorrowingSuspension>;

export enum SuspensionReason {
  /** Number of overdue items exceeded the threshold. */
  OVERDUE_COUNT = 'overdue_count',
  /** Oldest overdue item is past the age threshold (days). */
  OVERDUE_AGE = 'overdue_age',
  /** Outstanding balance exceeds the unpaid-balance threshold. */
  UNPAID_BALANCE = 'unpaid_balance',
  /** Staff-initiated manual suspension. */
  MANUAL = 'manual',
}

export enum SuspensionStatus {
  /** Patron's borrowing access is currently blocked. */
  ACTIVE = 'active',
  /** Suspension was lifted automatically after reconciliation. */
  LIFTED_AUTO = 'lifted_auto',
  /** Suspension was lifted by a staff exception/override. */
  LIFTED_EXCEPTION = 'lifted_exception',
}

/**
 * Audit record of a single suspension event.
 *
 * A patron may have multiple suspension records over time; the one with
 * `status: ACTIVE` is the current effective suspension. Returns and payments
 * trigger a reconciliation check that lifts the suspension automatically
 * by transitioning to `LIFTED_AUTO`.
 *
 * The `PatronProfile.status` field is the live gate: the suspension service
 * keeps it in sync with the state of this collection.
 */
@Schema({ timestamps: true, collection: 'library_borrowing_suspensions' })
export class BorrowingSuspension {
  /** Patron whose borrowing access is affected. */
  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true, enum: SuspensionStatus, default: SuspensionStatus.ACTIVE })
  status: SuspensionStatus;

  /** Policy dimension that triggered this suspension. */
  @Prop({ required: true, enum: SuspensionReason })
  reason: SuspensionReason;

  /** Human-readable explanation of why borrowing is blocked, including what to do. */
  @Prop({ required: true })
  message: string;

  /**
   * Threshold snapshot at the time of suspension:
   * the policy value that was exceeded and the measured value.
   */
  @Prop({ type: Object, default: {} })
  thresholdSnapshot: {
    thresholdName: string;
    thresholdValue: number;
    measuredValue: number;
  };

  /**
   * Policy-derived: whether this suspension lifts automatically when
   * reconciliation conditions are met (overdue count/age drops below
   * threshold, or outstanding balance is paid down).
   */
  @Prop({ required: true, default: true })
  autoLift: boolean;

  /** ISO date after which the suspension is unconditionally valid, regardless of auto-lift. */
  @Prop({ type: Date, default: null })
  suspendedUntil: Date | null;

  /** Actor who created this suspension record ('system' for policy-derived). */
  @Prop({ required: true })
  createdBy: string;

  /** Actor who lifted the suspension (null if still active). */
  @Prop({ type: String, default: null })
  liftedBy: string | null;

  /** Reason the suspension was lifted (if lifted as an exception). */
  @Prop({ type: String, default: null })
  liftNote: string | null;

  /** When the suspension was lifted. */
  @Prop({ type: Date, default: null })
  liftedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BorrowingSuspensionSchema =
  SchemaFactory.createForClass(BorrowingSuspension);
BorrowingSuspensionSchema.index({ patronId: 1, status: 1 });
BorrowingSuspensionSchema.index({ status: 1, createdAt: -1 });
