import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReviewInfoRequestDocument = HydratedDocument<ReviewInfoRequest>;

/**
 * Lifecycle states for a reviewer info-request.
 *
 * OPEN        – request has been sent; awaiting applicant response.
 * RESPONDED   – the applicant has submitted at least one versioned response.
 * CANCELLED   – cancelled by the reviewer before a response was submitted.
 * EXPIRED     – deadline passed without a response (set by the deadline-
 *               enforcement job; applications with EXPIRED requests remain
 *               in UNDER_REVIEW so the committee can still decide).
 */
export enum InfoRequestStatus {
  OPEN = 'open',
  RESPONDED = 'responded',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

/**
 * A single bounded question asked within an info-request.
 *
 * Privacy:
 *   - Questions may describe sensitive review concerns; they are restricted
 *     to OWNER / ADMIN / INSTRUCTOR and the specific applicant who owns the
 *     application.
 *
 * Constraints:
 *   - `questionKey` must be unique within a request (enforced by the service).
 *   - `required` defaults to true so all questions must be answered unless
 *     explicitly marked optional.
 */
@Schema({ _id: true })
export class InfoRequestQuestion {
  /** Auto-generated ObjectId for this question. Used as the answer target key. */
  _id: Types.ObjectId;

  /**
   * Stable slug for this question within the request.
   * Examples: "proof_of_enrollment", "gpa_transcript".
   * Must be unique within the parent request (validated by service).
   */
  @Prop({ required: true, trim: true, maxlength: 100 })
  questionKey: string;

  /** Human-readable question text shown to the applicant. */
  @Prop({ required: true, trim: true, maxlength: 1000 })
  text: string;

  /**
   * Whether this question must be answered in a response.
   * Defaults to true; optional questions may be skipped.
   */
  @Prop({ required: true, default: true })
  required: boolean;

  /**
   * Optional per-question guidance for the applicant.
   * (e.g. "Attach a scan or paste a link")
   */
  @Prop({ trim: true, maxlength: 500 })
  hint?: string;
}

export const InfoRequestQuestionSchema =
  SchemaFactory.createForClass(InfoRequestQuestion);

// ── Versioned response sub-document ─────────────────────────────────────────

/**
 * A single answer supplied by the applicant for one question within a
 * versioned response.
 */
@Schema({ _id: false })
export class InfoRequestAnswerEntry {
  /**
   * References `InfoRequestQuestion._id` (stored as ObjectId string for
   * simpler cross-language interoperability).
   */
  @Prop({ required: true, type: Types.ObjectId })
  questionId: Types.ObjectId;

  /** The applicant's text answer for this question. */
  @Prop({ required: true, trim: true, maxlength: 5000 })
  value: string;
}

export const InfoRequestAnswerEntrySchema =
  SchemaFactory.createForClass(InfoRequestAnswerEntry);

/**
 * One complete response submission from the applicant.
 *
 * Responses are versioned — each submission appends a new
 * `InfoRequestResponse` to the parent document's `responses` array.
 * Earlier versions are never mutated; the latest entry in the array is
 * the authoritative response.
 *
 * Immutability:
 *   Once persisted, a response version must not be modified.  The service
 *   appends a new version instead of updating an existing one so the full
 *   revision history is always auditable.
 */
@Schema({ _id: true })
export class InfoRequestResponse {
  /** Auto-generated id for this response version. */
  _id: Types.ObjectId;

  /**
   * Monotonically increasing version number (1-based).
   * Version 1 is the first response; each subsequent submission increments by 1.
   */
  @Prop({ required: true, min: 1 })
  version: number;

  /** Answers for each question in this response version. */
  @Prop({ type: [InfoRequestAnswerEntrySchema], default: [] })
  answers: InfoRequestAnswerEntry[];

  /** Optional covering note from the applicant. */
  @Prop({ trim: true, maxlength: 2000 })
  note?: string;

  /** JWT `sub` of the applicant who submitted this response version. */
  @Prop({ required: true })
  submittedBy: string;

  /** Wall-clock time at which this response version was recorded. */
  @Prop({ required: true })
  submittedAt: Date;
}

export const InfoRequestResponseSchema =
  SchemaFactory.createForClass(InfoRequestResponse);

// ── Root document ─────────────────────────────────────────────────────────────

/**
 * A reviewer's request for additional information from a scholarship
 * applicant (issue #1146).
 *
 * Lifecycle:
 *   OPEN → RESPONDED  (applicant submits a response before deadline)
 *   OPEN → CANCELLED  (reviewer cancels before a response arrives)
 *   OPEN → EXPIRED    (deadline-enforcement job marks the request expired)
 *   RESPONDED → RESPONDED (applicant submits a further revised version)
 *
 * Ownership / Privacy:
 *   - All documents are tenant-scoped via `organizationId`.
 *   - Questions and responses may contain applicant PII.  Staff
 *     (OWNER / ADMIN / INSTRUCTOR) can read the full document.  Applicants
 *     can read documents where `applicationId` matches their own application
 *     and may only submit responses, not create or cancel requests.
 *
 * Migration:
 *   - New collection `scholarship_review_info_requests`.
 *   - No existing data is affected; collection is created on first write.
 *   - Compound indexes are created automatically when Mongoose `autoIndex`
 *     is enabled.  Run `createIndex` manually otherwise.
 *
 * Notification:
 *   - On creation: applicant is notified by email/platform notification.
 *   - On response: reviewer is notified.
 *   - On expiry (job): reviewer is notified that the deadline passed.
 *   - On cancellation: applicant is notified.
 */
@Schema({
  timestamps: true,
  collection: 'scholarship_review_info_requests',
})
export class ReviewInfoRequest {
  /** Tenant scope — mirrors the owning application's organizationId. */
  @Prop({ required: true, index: true })
  organizationId: string;

  /** The application this request is associated with. */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipApplication',
    index: true,
  })
  applicationId: Types.ObjectId;

  /**
   * The scholarship program (denormalized for efficient query filtering
   * without a lookup join to the application).
   */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipProgram',
    index: true,
  })
  programId: Types.ObjectId;

  /**
   * JWT `sub` of the reviewer who created this request.
   * Only this reviewer may cancel the request.
   */
  @Prop({ required: true, index: true })
  reviewerId: string;

  /**
   * JWT `sub` (or applicant identifier) of the applicant who owns the
   * application.  Stored at creation time for notification routing.
   */
  @Prop({ required: true })
  applicantId: string;

  @Prop({
    required: true,
    enum: InfoRequestStatus,
    default: InfoRequestStatus.OPEN,
    index: true,
  })
  status: InfoRequestStatus;

  /**
   * Bounded list of questions the reviewer wants answered.
   * Must contain at least one question (validated by service).
   * `questionKey` must be unique within the array (validated by service).
   */
  @Prop({ type: [InfoRequestQuestionSchema], default: [] })
  questions: InfoRequestQuestion[];

  /**
   * Response deadline (UTC).  The applicant must submit a response before
   * this timestamp.  The deadline-enforcement job runs periodically and
   * transitions OPEN requests past this time to EXPIRED.
   *
   * Must be a future date at creation time (validated by service).
   */
  @Prop({ required: true, index: true })
  deadline: Date;

  /**
   * Ordered list of response versions submitted by the applicant.
   * Append-only — older versions are never modified.
   * The latest entry (highest `version`) is the current authoritative
   * response.
   */
  @Prop({ type: [InfoRequestResponseSchema], default: [] })
  responses: InfoRequestResponse[];

  /**
   * Optional context note from the reviewer explaining why this
   * information is needed (visible to the applicant).
   */
  @Prop({ trim: true, maxlength: 2000 })
  reviewerNote?: string;

  /**
   * Reason supplied by the reviewer when cancelling.
   * Populated only when status transitions to CANCELLED.
   */
  @Prop({ trim: true, maxlength: 500 })
  cancellationReason?: string;

  /** Timestamp when the request was cancelled (status → CANCELLED). */
  @Prop()
  cancelledAt?: Date;

  /** Timestamp when the request expired (status → EXPIRED, set by the job). */
  @Prop()
  expiredAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReviewInfoRequestSchema =
  SchemaFactory.createForClass(ReviewInfoRequest);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Efficient lookup of all open requests for an application.
ReviewInfoRequestSchema.index({ applicationId: 1, status: 1 });

// Tenant-scoped program-level queries.
ReviewInfoRequestSchema.index({ organizationId: 1, programId: 1, status: 1 });

// Deadline-enforcement job: find all OPEN requests past their deadline.
ReviewInfoRequestSchema.index({ status: 1, deadline: 1 });
