import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ScholarshipAwardDocument = HydratedDocument<ScholarshipAward>;

// ── Enumerations ──────────────────────────────────────────────────────────────

/**
 * Full lifecycle of a materialized scholarship award.
 *
 * Legal transitions:
 *   PENDING_ACCEPTANCE → ACCEPTED       (applicant accepts within deadline)
 *   PENDING_ACCEPTANCE → DECLINED       (applicant explicitly declines)
 *   PENDING_ACCEPTANCE → OFFER_EXPIRED  (acceptance deadline elapses — set by cron)
 *   ACCEPTED           → RESCINDED      (organization rescinds post-acceptance)
 *
 * Terminal states: DECLINED, OFFER_EXPIRED, RESCINDED.
 * Once a terminal state is reached no further transitions are permitted.
 *
 * Migration notes:
 *   New collection `scholarship_awards`.  No existing collections are modified.
 *   The unique index `{ applicationId: 1 }` ensures at most one award per
 *   application; a new award may only be created once the previous one (if any)
 *   has reached a terminal state.
 *
 * Conflict prevention:
 *   The service queries for any active award (PENDING_ACCEPTANCE or ACCEPTED)
 *   held by the same applicant within the same organization before creating a
 *   new one.  If one exists, BIZ_AWARD_CONFLICT is thrown.  This enforces the
 *   "an applicant cannot hold conflicting awards" rule from issue #1151.
 *
 * Privacy:
 *   Award amounts, terms, and milestone details are internal financial data
 *   scoped to the tenant.  Applicants may read only their own awards via the
 *   authenticated acceptance endpoint; raw award documents must not be exposed
 *   to unauthenticated callers or other applicants.
 */
export enum AwardStatus {
  PENDING_ACCEPTANCE = 'pending_acceptance',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  OFFER_EXPIRED = 'offer_expired',
  RESCINDED = 'rescinded',
}

/**
 * Active statuses — an applicant "holds" an award while it is in one of these.
 * Used for conflict detection: at most one active award per applicant per org.
 */
export const ACTIVE_AWARD_STATUSES: ReadonlySet<AwardStatus> = new Set([
  AwardStatus.PENDING_ACCEPTANCE,
  AwardStatus.ACCEPTED,
]);

/**
 * Terminal statuses — no further transitions permitted.
 */
export const TERMINAL_AWARD_STATUSES: ReadonlySet<AwardStatus> = new Set([
  AwardStatus.DECLINED,
  AwardStatus.OFFER_EXPIRED,
  AwardStatus.RESCINDED,
]);

/**
 * Permitted status transitions.  Any pair absent from this map is illegal and
 * rejected with BIZ_AWARD_INVALID_STATE.
 */
export const AWARD_STATUS_TRANSITIONS: Readonly<
  Record<AwardStatus, AwardStatus[]>
> = {
  [AwardStatus.PENDING_ACCEPTANCE]: [
    AwardStatus.ACCEPTED,
    AwardStatus.DECLINED,
    AwardStatus.OFFER_EXPIRED,
  ],
  [AwardStatus.ACCEPTED]: [AwardStatus.RESCINDED],
  [AwardStatus.DECLINED]: [],
  [AwardStatus.OFFER_EXPIRED]: [],
  [AwardStatus.RESCINDED]: [],
};

// ── Sub-documents ─────────────────────────────────────────────────────────────

/**
 * A single disbursement milestone attached to an award.
 *
 * Milestones describe when and how the award amount will be paid out.  They
 * are informational — they do not gate budget reservation transitions.
 *
 * Validation:
 *   - `startsAt` must be before `endsAt` when both are provided.
 *   - `amount` must be > 0 and the sum of milestone amounts should not exceed
 *     the total award amount (enforced at the service layer).
 *
 * Operational impact:
 *   The milestones array is embedded in the award document.  For programs with
 *   many milestones the document size will grow; keep this under 16 MB (the
 *   MongoDB document size limit).  In practice, scholarships rarely exceed 12
 *   milestones.
 */
@Schema({ _id: true })
export class AwardMilestone {
  /** Auto-generated stable id for client reference. */
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ trim: true, maxlength: 1000 })
  description?: string;

  /**
   * Portion of the award amount to be disbursed at this milestone.
   * Must be > 0.  Sum of all milestone amounts must not exceed `amount` on
   * the parent award.
   */
  @Prop({ required: true, min: 1 })
  amount: number;

  /** Optional start of the milestone period. */
  @Prop({ default: null })
  startsAt: Date | null;

  /** Optional end of the milestone period.  Must be after `startsAt` if set. */
  @Prop({ default: null })
  endsAt: Date | null;
}

export const AwardMilestoneSchema =
  SchemaFactory.createForClass(AwardMilestone);

/**
 * Append-only status-change history entry.
 *
 * Every status transition appends one entry to `statusHistory`.  Entries are
 * never removed or overwritten, providing a complete audit trail.
 *
 * Operational impact:
 *   The array grows with every transition.  For awards with many rescission /
 *   re-issuance cycles consider archiving to a separate audit collection.
 *
 * Privacy:
 *   `changedBy` is the JWT `sub` of the staff member or cron actor who triggered
 *   the transition.  Internal staff data — do not expose to applicants.
 */
@Schema({ _id: false })
export class AwardStatusHistoryEntry {
  @Prop({ required: true, enum: AwardStatus })
  status: AwardStatus;

  /** JWT `sub` of the actor who triggered the transition, or `'system'` for cron. */
  @Prop({ required: true })
  changedBy: string;

  @Prop({ required: true })
  changedAt: Date;

  @Prop({ trim: true, maxlength: 500 })
  reason?: string;
}

export const AwardStatusHistoryEntrySchema = SchemaFactory.createForClass(
  AwardStatusHistoryEntry,
);

// ── Root document ─────────────────────────────────────────────────────────────

/**
 * A materialized scholarship award — the authoritative record created once a
 * committee decision resolves to AWARDED and the organization confirms the grant.
 *
 * Relationship to adjacent domain objects:
 *   - `applicationId` → ScholarshipApplication (the winning application)
 *   - `programId`     → ScholarshipProgram (the program that funds the award)
 *   - `reservationId` → BudgetReservation (the PENDING budget hold backing this award)
 *
 * Acceptance flow:
 *   1. Staff creates the award (POST /scholarships/awards) — status PENDING_ACCEPTANCE.
 *      A BudgetReservation must already exist or is referenced via `reservationId`.
 *   2. The applicant accepts (POST /scholarships/awards/:id/accept) before
 *      `acceptanceDeadline` — status → ACCEPTED.  The service also confirms the
 *      linked BudgetReservation (PENDING → CONFIRMED).
 *   3. If the deadline elapses without acceptance the cron job transitions
 *      status → OFFER_EXPIRED and releases the BudgetReservation (PENDING → EXPIRED).
 *
 * Conflict prevention:
 *   The service queries `{ applicantId, organizationId, status: { $in: ACTIVE_AWARD_STATUSES } }`
 *   before creation.  If a match is found, BIZ_AWARD_CONFLICT is thrown.
 *   This ensures no applicant holds two concurrently active awards within the
 *   same tenant.
 *
 * Tenant isolation:
 *   All queries must include `organizationId`.
 *
 * Migration:
 *   New collection `scholarship_awards`.
 *   No existing documents are modified.
 */
@Schema({ timestamps: true, collection: 'scholarship_awards' })
export class ScholarshipAward {
  /** Tenant scope — matches the owning program / application's organizationId. */
  @Prop({ required: true, index: true })
  organizationId: string;

  /** The application that earned this award. */
  @Prop({
    required: true,
    unique: true,
    type: Types.ObjectId,
    ref: 'ScholarshipApplication',
    index: true,
  })
  applicationId: Types.ObjectId;

  /** Denormalized program reference for program-level list queries. */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipProgram',
    index: true,
  })
  programId: Types.ObjectId;

  /**
   * JWT `sub` of the student applicant.
   * Denormalized from the application for conflict-detection queries
   * (avoids a join to the application collection on every create).
   *
   * Conflict-detection index: `{ applicantId, organizationId, status }`.
   */
  @Prop({ required: true, index: true })
  applicantId: string;

  /**
   * Reference to the BudgetReservation that backs this award.
   *
   * The reservation is created separately (via the Budget Reservation API)
   * before or at the same time as this award document.  The service links the
   * two so that accepting / expiring the award automatically transitions the
   * reservation.
   *
   * `null` when no reservation is linked (e.g. unfunded honorific awards).
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'BudgetReservation',
    default: null,
  })
  reservationId: Types.ObjectId | null;

  // ── Financial terms ────────────────────────────────────────────────────────

  /**
   * Monetary value of the award.  Must be > 0.
   * If `reservationId` is set this should match the linked reservation's amount.
   */
  @Prop({ required: true, min: 1 })
  amount: number;

  /**
   * ISO 4217 currency code (e.g. "USD", "EUR", "NGN").
   * Must match the program's budget ledger currency when a reservation is linked.
   */
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 10 })
  currency: string;

  /**
   * Prose terms of the award (payment schedule narrative, conditions, obligations).
   * Stored as plain text.  Required so the applicant can review conditions
   * before accepting.
   *
   * Privacy:
   *   May contain legally sensitive conditions.  Scoped to the tenant.
   */
  @Prop({ required: true, trim: true, maxlength: 5000 })
  termsText: string;

  /**
   * Structured disbursement milestones.  Optional — omit for lump-sum awards.
   *
   * The sum of `milestone.amount` values should not exceed `amount`.
   * Enforcement is advisory (service warns but does not reject partial sums).
   */
  @Prop({ type: [AwardMilestoneSchema], default: [] })
  milestones: AwardMilestone[];

  // ── Acceptance window ──────────────────────────────────────────────────────

  /**
   * Deadline by which the applicant must formally accept the offer.
   * Must be a future date at the time of award creation.
   *
   * After this timestamp:
   *   - The cron job transitions status → OFFER_EXPIRED.
   *   - The linked BudgetReservation (if any) transitions PENDING → EXPIRED,
   *     releasing the held budget back to available capacity.
   */
  @Prop({ required: true, index: true })
  acceptanceDeadline: Date;

  // ── Status ─────────────────────────────────────────────────────────────────

  @Prop({
    required: true,
    enum: AwardStatus,
    default: AwardStatus.PENDING_ACCEPTANCE,
    index: true,
  })
  status: AwardStatus;

  /**
   * Timestamp when the applicant accepted or declined.
   * Null until the award reaches ACCEPTED or DECLINED.
   */
  @Prop({ default: null })
  respondedAt: Date | null;

  /**
   * Optional free-text note supplied by the applicant at acceptance/decline time.
   * Stored for audit / scholarship management purposes.
   *
   * Privacy: May contain applicant PII; scoped to the tenant.
   */
  @Prop({ trim: true, maxlength: 1000, default: null })
  applicantNote: string | null;

  /**
   * Timestamp when an ACCEPTED award was rescinded by the organization.
   * Null unless status = RESCINDED.
   */
  @Prop({ default: null })
  rescindedAt: Date | null;

  /** JWT `sub` of the staff member who rescinded the award. */
  @Prop({ default: null })
  rescindedBy: string | null;

  /** Mandatory reason recorded when the award is rescinded. */
  @Prop({ trim: true, maxlength: 1000, default: null })
  rescissionReason: string | null;

  // ── Audit ──────────────────────────────────────────────────────────────────

  /** JWT `sub` of the staff member who created this award record. */
  @Prop({ required: true })
  createdBy: string;

  /**
   * Append-only status-change history.
   * Every status transition appends an entry here; entries are never removed.
   *
   * Operational impact:
   *   Array grows with every transition.  Awards with repeated rescission cycles
   *   can have many entries; archive to a separate collection if needed.
   */
  @Prop({ type: [AwardStatusHistoryEntrySchema], default: [] })
  statusHistory: AwardStatusHistoryEntry[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const ScholarshipAwardSchema =
  SchemaFactory.createForClass(ScholarshipAward);

// ── Compound indexes ──────────────────────────────────────────────────────────

/**
 * Powers conflict-detection query:
 *   { applicantId, organizationId, status: { $in: ['pending_acceptance','accepted'] } }
 */
ScholarshipAwardSchema.index({ applicantId: 1, organizationId: 1, status: 1 });

/** Program-level list with status filter. */
ScholarshipAwardSchema.index({ organizationId: 1, programId: 1, status: 1 });

/**
 * Powers the cron expiry sweep:
 *   { status: 'pending_acceptance', acceptanceDeadline: { $lte: now } }
 * Partial index keeps it small — only PENDING_ACCEPTANCE documents are indexed.
 */
ScholarshipAwardSchema.index(
  { status: 1, acceptanceDeadline: 1 },
  { partialFilterExpression: { status: AwardStatus.PENDING_ACCEPTANCE } },
);
