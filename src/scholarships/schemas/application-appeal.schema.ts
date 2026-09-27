import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ApplicationAppealDocument = HydratedDocument<ApplicationAppeal>;

// ── Enumerations ──────────────────────────────────────────────────────────────

/**
 * Grounds categories the applicant may cite when filing an appeal.
 *
 * PROCEDURAL_ERROR      – the applicant believes the review process was not
 *                         followed correctly (e.g. a required step was skipped,
 *                         conflicted reviewers were not excluded).
 * NEW_EVIDENCE          – material evidence that was not available at the time
 *                         of the original decision has since become available.
 * BIAS_OR_MISCONDUCT    – the applicant alleges that a reviewer acted with
 *                         bias, misconduct, or a conflict of interest.
 * FACTUAL_ERROR         – the decision was based on an incorrect or
 *                         misrepresented fact that, if corrected, would change
 *                         the outcome.
 * OTHER                 – any other grounds; must be described in `statement`.
 */
export enum AppealGrounds {
  PROCEDURAL_ERROR = 'procedural_error',
  NEW_EVIDENCE = 'new_evidence',
  BIAS_OR_MISCONDUCT = 'bias_or_misconduct',
  FACTUAL_ERROR = 'factual_error',
  OTHER = 'other',
}

/**
 * Lifecycle states for an application appeal.
 *
 * PENDING      – appeal has been submitted; awaiting staff triage.
 * UNDER_REVIEW – a reviewer (who is not one of the original reviewers) has
 *                taken ownership and is actively reviewing the appeal.
 * UPHELD       – appeal is sustained; the original decision is reversed or
 *                a new review round is opened.
 * DISMISSED    – appeal is rejected; the original decision stands.
 * WITHDRAWN    – the applicant withdrew the appeal before a decision was made.
 * EXPIRED      – the appeal window closed before a decision was recorded
 *                (set by the deadline-enforcement cron job).
 *
 * Legal transitions:
 *   PENDING       → UNDER_REVIEW  (staff takes ownership)
 *   PENDING       → WITHDRAWN     (applicant withdraws)
 *   PENDING       → EXPIRED       (deadline-enforcement job)
 *   UNDER_REVIEW  → UPHELD        (staff resolves in applicant's favour)
 *   UNDER_REVIEW  → DISMISSED     (staff dismisses)
 *   UNDER_REVIEW  → WITHDRAWN     (applicant withdraws while under review)
 *
 * Terminal states: UPHELD, DISMISSED, WITHDRAWN, EXPIRED.
 */
export enum AppealStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  UPHELD = 'upheld',
  DISMISSED = 'dismissed',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired',
}

/** Statuses from which an appeal may still be resolved by staff. */
export const ACTIVE_APPEAL_STATUSES: ReadonlySet<AppealStatus> = new Set([
  AppealStatus.PENDING,
  AppealStatus.UNDER_REVIEW,
]);

/** Terminal statuses — no further transitions are permitted. */
export const TERMINAL_APPEAL_STATUSES: ReadonlySet<AppealStatus> = new Set([
  AppealStatus.UPHELD,
  AppealStatus.DISMISSED,
  AppealStatus.WITHDRAWN,
  AppealStatus.EXPIRED,
]);

/**
 * Permitted status transitions.  Any pair absent from this map is illegal.
 */
export const APPEAL_STATUS_TRANSITIONS: Readonly<
  Record<AppealStatus, AppealStatus[]>
> = {
  [AppealStatus.PENDING]: [
    AppealStatus.UNDER_REVIEW,
    AppealStatus.WITHDRAWN,
    AppealStatus.EXPIRED,
  ],
  [AppealStatus.UNDER_REVIEW]: [
    AppealStatus.UPHELD,
    AppealStatus.DISMISSED,
    AppealStatus.WITHDRAWN,
  ],
  [AppealStatus.UPHELD]: [],
  [AppealStatus.DISMISSED]: [],
  [AppealStatus.WITHDRAWN]: [],
  [AppealStatus.EXPIRED]: [],
};

// ── Sub-documents ─────────────────────────────────────────────────────────────

/**
 * A piece of evidence attached to an appeal by the applicant.
 *
 * Evidence is supplied as a URL or description; file uploads are handled
 * by the platform's upload service and the resulting URL stored here.
 *
 * Privacy:
 *   Evidence may contain applicant PII (transcripts, medical certificates,
 *   etc.).  Access is restricted to the applicant who owns the appeal and
 *   staff with OWNER / ADMIN role in the organization.
 */
@Schema({ _id: true })
export class AppealEvidence {
  /** Auto-generated stable id for client reference. */
  _id: Types.ObjectId;

  /**
   * Human-readable label describing this piece of evidence.
   * E.g. "Official transcript — Spring 2026", "Medical certificate".
   */
  @Prop({ required: true, trim: true, maxlength: 300 })
  label: string;

  /**
   * URL pointing to the evidence artifact.  Must be HTTPS.
   * Validated as a URL by the DTO layer.
   */
  @Prop({ required: true, trim: true, maxlength: 2000 })
  url: string;

  /** Optional free-text description providing context for this evidence. */
  @Prop({ trim: true, maxlength: 1000 })
  description?: string;

  /** Server timestamp when this evidence entry was recorded. */
  @Prop({ required: true })
  attachedAt: Date;
}

export const AppealEvidenceSchema = SchemaFactory.createForClass(AppealEvidence);

/**
 * Append-only audit log entry for the appeal document.
 *
 * Every state-mutating action (submit, take-ownership, decide, withdraw,
 * expire) appends an entry.  Entries are never removed or overwritten,
 * providing a full audit trail for compliance.
 */
@Schema({ _id: false })
export class AppealAuditEntry {
  /** Machine-readable action identifier (e.g. "submitted", "ownership_taken",
   *  "upheld", "dismissed", "withdrawn", "expired"). */
  @Prop({ required: true, trim: true, maxlength: 100 })
  action: string;

  /** JWT `sub` of the actor who triggered this action. */
  @Prop({ required: true })
  actorId: string;

  /** Display name of the actor at action time (denormalized for readability). */
  @Prop({ trim: true, maxlength: 200 })
  actorDisplayName?: string;

  /** Server timestamp of this action. */
  @Prop({ required: true })
  occurredAt: Date;

  /** Arbitrary structured payload capturing action-specific details. */
  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;
}

export const AppealAuditEntrySchema =
  SchemaFactory.createForClass(AppealAuditEntry);

// ── Root document ─────────────────────────────────────────────────────────────

/**
 * An applicant's appeal against an eligible scholarship decision.
 *
 * Eligibility:
 *   An appeal may be filed against an application whose status is REJECTED or
 *   whose associated CommitteeDecision outcome is REJECTED (the service
 *   enforces this).  Only one active appeal (PENDING or UNDER_REVIEW) may
 *   exist per application at a time.
 *
 * Reviewer exclusion:
 *   Original reviewers (those who cast votes on the CommitteeDecision or
 *   submitted a ScholarshipReview) are excluded from reviewing the appeal.
 *   The `excludedReviewerIds` array captures this exclusion list at appeal
 *   creation time for downstream use.
 *
 * Deadline enforcement:
 *   `submissionDeadline` marks the outer boundary by which an appeal must be
 *   filed after the original decision.  `resolutionDeadline` marks the time
 *   by which staff must resolve the appeal.  The cron job transitions PENDING
 *   appeals whose `resolutionDeadline` has passed to EXPIRED.
 *
 * Ownership / Privacy:
 *   - All documents are tenant-scoped via `organizationId`.
 *   - `statement` and `evidence` may contain applicant PII.
 *   - `reviewNotes` is staff-only; must not be exposed to the applicant.
 *   - `auditTrail` is restricted to OWNER / ADMIN access.
 *
 * Migration:
 *   - New collection `scholarship_application_appeals`.
 *   - No existing collections are modified.
 *   - Compound indexes are created automatically when Mongoose `autoIndex`
 *     is enabled.  Run `createIndex` manually otherwise.
 *
 * Operational impact:
 *   The `auditTrail` array grows with every transition.  For high-volume
 *   programs consider archiving old entries to a separate audit collection.
 */
@Schema({
  timestamps: true,
  collection: 'scholarship_application_appeals',
})
export class ApplicationAppeal {
  /** Tenant scope — mirrors the owning application's organizationId. */
  @Prop({ required: true, index: true })
  organizationId: string;

  /** The scholarship application being appealed. */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipApplication',
    index: true,
  })
  applicationId: Types.ObjectId;

  /**
   * Denormalized program reference for efficient program-level list queries
   * (avoids a lookup join to the application on every list request).
   */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipProgram',
    index: true,
  })
  programId: Types.ObjectId;

  /**
   * JWT `sub` of the applicant filing the appeal.
   * Denormalized from the application so the service can enforce ownership
   * without an extra application lookup on every write.
   */
  @Prop({ required: true, index: true })
  applicantId: string;

  /**
   * Original reviewer ids excluded from reviewing this appeal.
   * Populated at creation time by querying ScholarshipReview and
   * CommitteeDecision for the application.
   *
   * The appeal service must refuse to assign any of these ids as
   * `assignedReviewerId`.
   */
  @Prop({ type: [String], default: [] })
  excludedReviewerIds: string[];

  // ── Appeal content ─────────────────────────────────────────────────────────

  /**
   * Grounds category for this appeal.
   * One of the AppealGrounds enum values.
   */
  @Prop({
    required: true,
    enum: AppealGrounds,
    index: true,
  })
  grounds: AppealGrounds;

  /**
   * Detailed narrative from the applicant explaining their appeal.
   * Required — must provide meaningful context beyond just the grounds.
   *
   * Privacy: may contain applicant PII.  Scoped to tenant.
   */
  @Prop({ required: true, trim: true, maxlength: 5000 })
  statement: string;

  /**
   * Evidence items the applicant has attached to support the appeal.
   * Optional — some grounds (e.g. PROCEDURAL_ERROR) may not need evidence.
   */
  @Prop({ type: [AppealEvidenceSchema], default: [] })
  evidence: AppealEvidence[];

  // ── Status and lifecycle ───────────────────────────────────────────────────

  @Prop({
    required: true,
    enum: AppealStatus,
    default: AppealStatus.PENDING,
    index: true,
  })
  status: AppealStatus;

  /**
   * Deadline by which staff must resolve the appeal.
   * Must be a future date at the time of appeal creation.
   *
   * After this timestamp the deadline-enforcement cron job transitions
   * PENDING appeals to EXPIRED and notifies involved parties.
   */
  @Prop({ required: true, index: true })
  resolutionDeadline: Date;

  // ── Staff review ───────────────────────────────────────────────────────────

  /**
   * JWT `sub` of the staff member who has taken ownership of reviewing this
   * appeal.  Must not be in `excludedReviewerIds`.
   * Null until `status` transitions to UNDER_REVIEW.
   */
  @Prop({ default: null })
  assignedReviewerId: string | null;

  /** Timestamp when the appeal was assigned (status → UNDER_REVIEW). */
  @Prop({ default: null })
  assignedAt: Date | null;

  /**
   * Internal notes from the reviewing staff member.
   *
   * Privacy:
   *   Staff-only field — must NEVER be returned to the applicant.
   *   Only OWNER / ADMIN may read this field.
   */
  @Prop({ trim: true, maxlength: 5000, default: null })
  reviewNotes: string | null;

  // ── Resolution ─────────────────────────────────────────────────────────────

  /**
   * Timestamp when the appeal reached a terminal state
   * (UPHELD, DISMISSED, WITHDRAWN, or EXPIRED).
   * Null while still active.
   */
  @Prop({ default: null })
  resolvedAt: Date | null;

  /** JWT `sub` of the actor who resolved the appeal.  Null while active. */
  @Prop({ default: null })
  resolvedBy: string | null;

  /**
   * Mandatory decision rationale provided when the appeal is UPHELD or
   * DISMISSED.  Visible to the applicant.
   *
   * Privacy: may contain limited context about reviewer deliberation.
   * Keep concise; detailed notes go in `reviewNotes`.
   */
  @Prop({ trim: true, maxlength: 2000, default: null })
  resolutionReason: string | null;

  // ── Withdrawal ─────────────────────────────────────────────────────────────

  /** Optional reason provided by the applicant when withdrawing the appeal. */
  @Prop({ trim: true, maxlength: 500, default: null })
  withdrawalReason: string | null;

  /** Timestamp when the applicant withdrew the appeal. */
  @Prop({ default: null })
  withdrawnAt: Date | null;

  // ── Audit trail ────────────────────────────────────────────────────────────

  /**
   * Append-only audit log.  Every create, status change, assignment, and
   * resolution appends an entry here.  Entries are never removed.
   */
  @Prop({ type: [AppealAuditEntrySchema], default: [] })
  auditTrail: AppealAuditEntry[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const ApplicationAppealSchema =
  SchemaFactory.createForClass(ApplicationAppeal);

// ── Compound indexes ──────────────────────────────────────────────────────────

/**
 * Enforces the "at most one active appeal per application" rule.
 * Used by the service to check for a duplicate before inserting.
 */
ApplicationAppealSchema.index({ applicationId: 1, status: 1 });

/** Program-level list queries with status filter. */
ApplicationAppealSchema.index({ organizationId: 1, programId: 1, status: 1 });

/**
 * Deadline-enforcement cron job:
 *   { status: { $in: ['pending','under_review'] }, resolutionDeadline: { $lte: now } }
 * Partial index keeps it small.
 */
ApplicationAppealSchema.index(
  { status: 1, resolutionDeadline: 1 },
  {
    partialFilterExpression: {
      status: { $in: [AppealStatus.PENDING, AppealStatus.UNDER_REVIEW] },
    },
  },
);
