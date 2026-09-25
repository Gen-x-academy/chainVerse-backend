import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ScholarshipReviewDocument = HydratedDocument<ScholarshipReview>;

/**
 * Lifecycle states for an individual reviewer's submission.
 *
 * PENDING   – slot reserved (e.g. reviewer assigned) but scores not yet saved.
 * COMPLETED – reviewer has submitted all criterion scores; contributes to the
 *             aggregate calculation.
 * ABSTAINED – reviewer deliberately declined to score (treated as a missing
 *             review during aggregate computation; not counted in the divisor).
 */
export enum ReviewStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  ABSTAINED = 'abstained',
}

/**
 * A single rubric criterion score submitted by one reviewer.
 *
 * Precision:
 *   - `score` is stored as a plain JS number.  Callers must supply a value in
 *     [0, maxScore] inclusive.  The service validates this before persistence.
 *   - `weight` is stored as a decimal in (0, 1].  All weights on a review
 *     must sum to 1.0 within WEIGHT_SUM_TOLERANCE (see service).
 *
 * Immutability:
 *   - Criteria sub-documents are written once at review submission and never
 *     mutated afterwards.  The aggregate service reads them as an immutable
 *     input to guarantee reproducibility.
 *
 * Privacy:
 *   - Criteria scores are internal staff data.  Applicants must not receive
 *     individual reviewer scores; only the blinded aggregate is exposed.
 */
@Schema({ _id: true })
export class ReviewCriterion {
  /** Auto-generated ObjectId for this criterion entry. */
  _id: Types.ObjectId;

  /**
   * Stable slug identifying the rubric dimension.
   * Examples: "academic_merit", "financial_need", "community_impact".
   * Must be consistent across all reviewers for the same program so
   * aggregate computation can group by criterion key.
   */
  @Prop({ required: true, trim: true, maxlength: 100 })
  criterionKey: string;

  /** Human-readable label for this rubric dimension. */
  @Prop({ required: true, trim: true, maxlength: 200 })
  label: string;

  /**
   * Score awarded by this reviewer for the criterion.
   * Must be in the range [0, maxScore] inclusive.
   */
  @Prop({ required: true, min: 0 })
  score: number;

  /**
   * Maximum possible score for this criterion.
   * Must be > 0.  Used to normalize scores to [0, 1] before weighting.
   * The same maxScore must be used for a given criterionKey across all
   * reviewers of the same program to ensure comparability.
   */
  @Prop({ required: true, min: 1 })
  maxScore: number;

  /**
   * Relative importance weight of this criterion in the overall rubric.
   * Decimal in (0, 1].  All weights across the review's criteria array must
   * sum to 1.0 within a tolerance of ±0.001.
   *
   * Weights are supplied by the reviewer at submission time and validated
   * server-side.  To enforce a fixed rubric, the admin layer should supply
   * weights programmatically rather than allowing free-form reviewer input.
   */
  @Prop({ required: true, min: 0.001, max: 1 })
  weight: number;

  /** Optional free-text justification for the score on this criterion. */
  @Prop({ trim: true, maxlength: 1000 })
  justification?: string;
}

export const ReviewCriterionSchema =
  SchemaFactory.createForClass(ReviewCriterion);

/**
 * One reviewer's complete evaluation of a scholarship application.
 *
 * Aggregate computation (issue #1147):
 *   The normalized aggregate score for an application is derived from all
 *   COMPLETED reviews by:
 *     1. For each review, compute the weighted normalized score:
 *        Σ (criterion.score / criterion.maxScore) × criterion.weight
 *     2. Average the per-review scores across all COMPLETED reviews.
 *     3. Round to AGGREGATE_SCORE_PRECISION decimal places (4 d.p.).
 *
 *   PENDING and ABSTAINED reviews are excluded from step 2.  When the
 *   minimum review threshold (set per program) is not met the endpoint
 *   returns BIZ_NO_COMPLETED_REVIEWS rather than a partial aggregate.
 *
 * Tie policy:
 *   When two or more applications share the same rounded aggregate score,
 *   the tie is broken by `submittedAt` ascending (earlier submission wins).
 *   This is deterministic and reproducible from immutable inputs.
 *
 * Reproducibility:
 *   Because criteria sub-documents are immutable after submission and
 *   the algorithm is deterministic, any client can reproduce the aggregate
 *   by re-running the formula against the stored criteria values.
 *
 * Ownership / Privacy:
 *   - `reviewerId` is the JWT `sub` of the reviewer; it is organization-
 *     internal staff data and must not be returned to applicants.
 *   - Individual criterion scores are also staff-only; only the blinded
 *     aggregate is visible to applicants.
 *   - All reviews are scoped to `organizationId` (tenant isolation).
 *
 * Migration:
 *   - New collection `scholarship_reviews`.  No existing data is affected.
 *   - The compound unique index `{ applicationId, reviewerId }` is created
 *     automatically at boot.  Run `createIndex` manually when Mongoose
 *     `autoIndex` is disabled.
 */
@Schema({ timestamps: true, collection: 'scholarship_reviews' })
export class ScholarshipReview {
  /** Tenant scope — mirrors the owning application's organizationId. */
  @Prop({ required: true, index: true })
  organizationId: string;

  /** The application being evaluated. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'ScholarshipApplication', index: true })
  applicationId: Types.ObjectId;

  /** The scholarship program this application belongs to (denormalized for query efficiency). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'ScholarshipProgram', index: true })
  programId: Types.ObjectId;

  /** JWT `sub` of the staff member performing the review. */
  @Prop({ required: true, index: true })
  reviewerId: string;

  @Prop({
    required: true,
    enum: ReviewStatus,
    default: ReviewStatus.PENDING,
    index: true,
  })
  status: ReviewStatus;

  /**
   * Per-criterion scores supplied by the reviewer.
   *
   * Must be non-empty when status is COMPLETED.
   * Must be empty when status is ABSTAINED.
   * May be empty when status is PENDING (reviewer assigned but not started).
   */
  @Prop({ type: [ReviewCriterionSchema], default: [] })
  criteria: ReviewCriterion[];

  /**
   * Server-computed weighted normalized score for this single review.
   *
   * Formula: Σ (criterion.score / criterion.maxScore) × criterion.weight
   * Range: [0, 1], rounded to 4 decimal places.
   * Null when status is not COMPLETED.
   *
   * Stored at submission time for auditability; recomputed on every write
   * so it is always consistent with the stored criteria values.
   */
  @Prop({ min: 0, max: 1, default: null })
  normalizedScore: number | null;

  /** Optional overall comment from the reviewer (not per-criterion). */
  @Prop({ trim: true, maxlength: 2000 })
  overallComment?: string;

  /** Timestamp when the reviewer submitted (set when status → COMPLETED or ABSTAINED). */
  @Prop()
  submittedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ScholarshipReviewSchema =
  SchemaFactory.createForClass(ScholarshipReview);

// One review per (application, reviewer) — prevents duplicate submissions.
ScholarshipReviewSchema.index(
  { applicationId: 1, reviewerId: 1 },
  { unique: true },
);
// Efficient aggregate computation: fetch all COMPLETED reviews for an application.
ScholarshipReviewSchema.index({ applicationId: 1, status: 1 });
// Tenant-scoped program-level queries (e.g. list all reviews for a program).
ScholarshipReviewSchema.index({ organizationId: 1, programId: 1, status: 1 });
