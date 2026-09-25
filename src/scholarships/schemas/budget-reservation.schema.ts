import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// ── Enumerations ──────────────────────────────────────────────────────────────

/**
 * Lifecycle states of a single budget reservation.
 *
 * Legal transitions:
 *   PENDING  → CONFIRMED   (applicant accepts the award)
 *   PENDING  → EXPIRED     (TTL elapses without applicant acceptance)
 *   PENDING  → CANCELLED   (admin cancels before expiry)
 *   CONFIRMED → RELEASED   (award is rescinded / applicant declines post-accept)
 *
 * Only PENDING reservations count against the reserved-budget tally.
 * CONFIRMED reservations are considered disbursed and tracked separately.
 * EXPIRED, CANCELLED, and RELEASED reservations free their amount back to
 * available budget.
 */
export enum ReservationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  RELEASED = 'released',
}

/**
 * Terminal states — once a reservation reaches any of these statuses
 * it may not be transitioned further.
 */
export const TERMINAL_RESERVATION_STATUSES: ReadonlySet<ReservationStatus> =
  new Set([
    ReservationStatus.EXPIRED,
    ReservationStatus.CANCELLED,
    ReservationStatus.RELEASED,
  ]);

/**
 * Permitted status transitions.  Any pair not listed here is illegal and
 * will be rejected with BIZ_RESERVATION_INVALID_STATE.
 */
export const RESERVATION_STATUS_TRANSITIONS: Readonly<
  Record<ReservationStatus, ReservationStatus[]>
> = {
  [ReservationStatus.PENDING]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.EXPIRED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.CONFIRMED]: [ReservationStatus.RELEASED],
  [ReservationStatus.EXPIRED]: [],
  [ReservationStatus.CANCELLED]: [],
  [ReservationStatus.RELEASED]: [],
};

// ── BudgetLedger ──────────────────────────────────────────────────────────────

export type BudgetLedgerDocument = HydratedDocument<BudgetLedger>;

/**
 * One per scholarship program.  Tracks the authoritative capacity figures used
 * to gate new reservations.
 *
 * Concurrency model:
 *   All mutations to `reservedAmount` use MongoDB's `$inc` with a
 *   `{ reservedAmount: { $lte: totalBudget - amount } }` condition so the
 *   update is atomic and self-constraining without a separate read-modify-write
 *   cycle.  If the condition is not satisfied the update matches 0 documents
 *   and the service raises BIZ_BUDGET_INSUFFICIENT.
 *
 * Tenant isolation:
 *   All queries must include `organizationId`.
 *
 * Migration:
 *   New collection `scholarship_budget_ledgers`.
 *   The compound unique index `{ programId }` ensures one ledger per program.
 *
 * Operational impact:
 *   `reservedAmount` is incremented on every successful PENDING reservation and
 *   decremented when a reservation transitions to EXPIRED, CANCELLED, RELEASED,
 *   or when PENDING → CONFIRMED (the amount moves from reserved to disbursed).
 *   `disbursedAmount` is incremented only on PENDING → CONFIRMED.
 *
 * Privacy:
 *   Budget figures are internal financial data scoped to the tenant.
 *   Do not expose raw ledger documents to applicants.
 */
@Schema({ timestamps: true, collection: 'scholarship_budget_ledgers' })
export class BudgetLedger {
  /** Tenant scope — matches the owning program's organizationId. */
  @Prop({ required: true, index: true })
  organizationId: string;

  /** The scholarship program this ledger belongs to. */
  @Prop({
    required: true,
    unique: true,
    type: Types.ObjectId,
    ref: 'ScholarshipProgram',
    index: true,
  })
  programId: Types.ObjectId;

  /**
   * Maximum total monetary value (in `currency` units) that may be awarded
   * across all reservations for this program.
   *
   * Invariant: totalBudget >= reservedAmount + disbursedAmount
   * This invariant is maintained atomically by the service layer.
   */
  @Prop({ required: true, min: 0 })
  totalBudget: number;

  /**
   * Sum of amounts held by all currently PENDING reservations.
   * Decremented when a PENDING reservation is confirmed, expired, cancelled,
   * or released.
   *
   * Must never exceed: totalBudget - disbursedAmount
   */
  @Prop({ required: true, min: 0, default: 0 })
  reservedAmount: number;

  /**
   * Sum of amounts from all CONFIRMED (disbursed) reservations.
   * Incremented only when a PENDING reservation transitions to CONFIRMED.
   * Never decremented (confirmed awards are considered paid out).
   */
  @Prop({ required: true, min: 0, default: 0 })
  disbursedAmount: number;

  /**
   * ISO 4217 currency code (e.g. "USD", "EUR", "NGN").
   * All reservation amounts must use the same currency as the ledger.
   */
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 10 })
  currency: string;

  /** JWT `sub` of the staff member who initialised this ledger. */
  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BudgetLedgerSchema = SchemaFactory.createForClass(BudgetLedger);
BudgetLedgerSchema.index({ organizationId: 1, programId: 1 });

// ── BudgetReservation ─────────────────────────────────────────────────────────

export type BudgetReservationDocument = HydratedDocument<BudgetReservation>;

/**
 * One entry per award decision for a scholarship application.
 *
 * Lifecycle overview:
 *   1. When the committee AWARDS an application, the service atomically:
 *        a. Creates a PENDING BudgetReservation for the award amount.
 *        b. Increments BudgetLedger.reservedAmount by that amount, subject to
 *           the available-budget constraint.
 *      If the constraint is violated (not enough budget), both writes are
 *      aborted and BIZ_BUDGET_INSUFFICIENT is thrown.
 *
 *   2. The reservation expires automatically (via a scheduled job) if the
 *      applicant has not accepted within the TTL.  On expiry:
 *        a. Reservation status → EXPIRED.
 *        b. BudgetLedger.reservedAmount decremented by the reservation amount.
 *
 *   3. When the applicant accepts the award (PENDING → CONFIRMED):
 *        a. Reservation status → CONFIRMED.
 *        b. BudgetLedger.reservedAmount decremented.
 *        c. BudgetLedger.disbursedAmount incremented.
 *
 *   4. An OWNER/ADMIN may cancel a PENDING reservation at any time:
 *        a. Reservation status → CANCELLED.
 *        b. BudgetLedger.reservedAmount decremented.
 *
 *   5. A CONFIRMED reservation may be released (award rescinded):
 *        a. Reservation status → RELEASED.
 *        b. BudgetLedger.disbursedAmount decremented.
 *        (disbursedAmount is restored because the award was not paid out.)
 *
 * Exactly-once release guarantee:
 *   All status transitions use a conditional `findOneAndUpdate` with the
 *   current status as a filter predicate, so concurrent requests for the same
 *   reservation converge: the first succeeds, the second matches 0 documents
 *   and the service detects the race and re-reads the final status to give a
 *   meaningful error.
 *
 * Tenant isolation:
 *   All queries must filter by `organizationId`.
 *
 * Migration:
 *   New collection `scholarship_budget_reservations`.
 *   The unique index `{ applicationId }` ensures at most one active reservation
 *   per application at a time.  (Expired/cancelled/released reservations are
 *   retained for audit; a new PENDING reservation can be created only if no
 *   active one exists.)
 *
 * Privacy:
 *   Reservation amounts are internal financial data.  Do not expose to
 *   applicants via the public API.
 */
@Schema({ timestamps: true, collection: 'scholarship_budget_reservations' })
export class BudgetReservation {
  /** Tenant scope — matches the owning application's organizationId. */
  @Prop({ required: true, index: true })
  organizationId: string;

  /** The scholarship program this reservation belongs to. */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipProgram',
    index: true,
  })
  programId: Types.ObjectId;

  /**
   * The scholarship application for which the award is being held.
   * A program may have at most one active (PENDING or CONFIRMED) reservation
   * per application.
   */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipApplication',
    index: true,
  })
  applicationId: Types.ObjectId;

  /**
   * Monetary value reserved from the program budget.
   * Must be > 0 and must not exceed available budget at reservation time.
   */
  @Prop({ required: true, min: 0 })
  amount: number;

  /**
   * ISO 4217 currency code — must match the owning BudgetLedger's currency.
   */
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 10 })
  currency: string;

  @Prop({
    required: true,
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
    index: true,
  })
  status: ReservationStatus;

  /**
   * Deadline by which the applicant must accept the award.
   * After this timestamp the reservation is eligible for expiry by the
   * scheduled job.  Must be a future date at the time of creation.
   */
  @Prop({ required: true, index: true })
  expiresAt: Date;

  /**
   * Server timestamp when this reservation transitioned to a terminal state
   * (EXPIRED, CANCELLED, RELEASED) or to CONFIRMED.
   * Null while still PENDING.
   */
  @Prop({ default: null })
  resolvedAt: Date | null;

  /**
   * JWT `sub` of the actor who triggered the most recent status transition.
   * Set to the system scheduler id (e.g. 'system:expiry-job') for automated
   * expiries.
   */
  @Prop({ default: null })
  resolvedBy: string | null;

  /**
   * Human-readable reason for cancellation or release.
   * Required when an OWNER/ADMIN cancels or releases a reservation so the
   * audit trail captures intent.
   */
  @Prop({ trim: true, maxlength: 500, default: null })
  reason: string | null;

  /** JWT `sub` of the staff member who created this reservation. */
  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BudgetReservationSchema =
  SchemaFactory.createForClass(BudgetReservation);

// ── Compound indexes ──────────────────────────────────────────────────────────

/** Program-level budget queries (e.g. list all reservations for a program). */
BudgetReservationSchema.index({ organizationId: 1, programId: 1, status: 1 });

/**
 * Expiry job index: find all PENDING reservations whose TTL has elapsed.
 * Partial index keeps it small — only PENDING documents are indexed.
 */
BudgetReservationSchema.index(
  { status: 1, expiresAt: 1 },
  { partialFilterExpression: { status: ReservationStatus.PENDING } },
);

/**
 * Unique active-reservation constraint: at most one PENDING or CONFIRMED
 * reservation per application.  Enforced in the service layer (not as a
 * DB-level unique index) because expired/cancelled/released reservations for
 * the same application must also be retained for auditing.
 */
BudgetReservationSchema.index({ applicationId: 1, status: 1 });
