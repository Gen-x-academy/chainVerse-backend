import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReviewStatus } from '../schemas/scholarship-review.schema';

// ── Criterion DTO ─────────────────────────────────────────────────────────────

/**
 * A single rubric criterion score within a review submission.
 *
 * The server validates:
 *   1. `score` is in [0, maxScore] inclusive.
 *   2. `maxScore` > 0.
 *   3. `weight` is in (0, 1].
 *   4. Across all criteria in the review, weights sum to 1.0 ± 0.001.
 *
 * These class-validator decorators enforce the DTO-layer bounds; the service
 * applies the cross-criterion weight-sum check after the array is assembled.
 */
export class ReviewCriterionDto {
  @ApiProperty({
    description:
      'Stable slug identifying the rubric dimension ' +
      '(e.g. "academic_merit", "financial_need"). ' +
      'Must be consistent across all reviewers for the same program.',
    example: 'academic_merit',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  criterionKey: string;

  @ApiProperty({
    description: 'Human-readable label for this rubric dimension.',
    example: 'Academic Merit',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  label: string;

  @ApiProperty({
    description: 'Score awarded for this criterion. Must be in [0, maxScore].',
    example: 8,
    minimum: 0,
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  score: number;

  @ApiProperty({
    description:
      'Maximum possible score for this criterion (> 0). ' +
      'Used to normalize the score to [0, 1] before weighting.',
    example: 10,
    minimum: 1,
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(1)
  maxScore: number;

  @ApiProperty({
    description:
      'Relative importance weight (0, 1]. ' +
      'All weights across the review criteria must sum to 1.0 ± 0.001.',
    example: 0.4,
    minimum: 0.001,
    maximum: 1,
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.001)
  @Max(1)
  weight: number;

  @ApiPropertyOptional({
    description: 'Optional free-text justification for this criterion score.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  justification?: string;
}

// ── Submit review ─────────────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/programs/:programId/applications/:applicationId/reviews`.
 *
 * Authorization: caller must be OWNER, ADMIN, or INSTRUCTOR of the organization
 * (verified by OrganizationRolesGuard before the handler runs).
 *
 * Business rules enforced by the service:
 *   - Application must be in `UNDER_REVIEW` status.
 *   - Reviewer may not submit more than one review per application
 *     (BIZ_REVIEW_ALREADY_EXISTS).
 *   - `criteria` must be non-empty (VAL_RUBRIC_CRITERIA_EMPTY).
 *   - Criterion weights must sum to 1.0 ± 0.001 (VAL_RUBRIC_WEIGHTS_INVALID).
 *   - Each `score` must be in [0, maxScore] (VAL_RUBRIC_SCORE_OUT_OF_RANGE).
 */
export class SubmitReviewDto {
  @ApiProperty({
    description:
      'Rubric criterion scores. Must contain at least one criterion. ' +
      'Weights must sum to 1.0 (± 0.001).',
    type: [ReviewCriterionDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReviewCriterionDto)
  criteria: ReviewCriterionDto[];

  @ApiPropertyOptional({
    description: 'Overall comment from the reviewer (not per-criterion).',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  overallComment?: string;
}

/**
 * Body DTO for `POST …/reviews/abstain`.
 *
 * Allows a reviewer to formally record that they are declining to score
 * an application.  An abstained review is excluded from aggregate
 * computation and is not counted in the completed-review divisor.
 */
export class AbstainReviewDto {
  @ApiPropertyOptional({
    description: 'Optional reason for abstaining.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overallComment?: string;
}

// ── Query DTOs ────────────────────────────────────────────────────────────────

/**
 * Query parameters for listing reviews on an application.
 *
 * `organizationId` is required for tenant isolation.
 * `status` filters by review lifecycle state.
 */
export class ListReviewsQueryDto {
  @ApiProperty({ description: 'Owning organization id (tenant scope).' })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({
    enum: ReviewStatus,
    description: 'Filter by review status.',
  })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}

/**
 * Query parameters for the aggregate score endpoint.
 * Only `organizationId` is required; no pagination is needed for a single scalar.
 */
export class AggregateScoreQueryDto {
  @ApiProperty({ description: 'Owning organization id (tenant scope).' })
  @IsMongoId()
  organizationId: string;
}

// ── Response shapes (plain objects, not Mongoose documents) ───────────────────

/**
 * The computed normalized aggregate score for one application, returned by
 * `GET …/reviews/aggregate`.
 *
 * `aggregateScore` is the mean of all COMPLETED per-review normalized scores,
 * rounded to 4 decimal places.  Range: [0, 1].
 *
 * `completedReviewCount` is the number of COMPLETED reviews that contributed.
 * `pendingReviewCount` is the number of still-PENDING reviews (useful for UI
 * progress indicators).
 *
 * Tie-breaking: when multiple applications share the same `aggregateScore`,
 * the application with the earlier `submittedAt` on its earliest COMPLETED
 * review wins.  The raw tie-break timestamp is NOT included in this response
 * to avoid leaking reviewer timing data; it is used only in ranking queries.
 */
export interface AggregateScoreResult {
  applicationId: string;
  organizationId: string;
  programId: string;
  /** Weighted normalized aggregate across all COMPLETED reviews. Range [0, 1]. */
  aggregateScore: number;
  /** Number of COMPLETED reviews that contributed to the aggregate. */
  completedReviewCount: number;
  /** Number of PENDING reviews not yet submitted. */
  pendingReviewCount: number;
  /** Number of ABSTAINED reviews (excluded from aggregate). */
  abstainedReviewCount: number;
  /** ISO timestamp of when the aggregate was computed. */
  computedAt: string;
}
