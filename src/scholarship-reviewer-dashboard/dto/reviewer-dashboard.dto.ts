import {
  IsBoolean,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewStatus } from '../../scholarships/schemas/scholarship-review.schema';

// ── Query DTOs ─────────────────────────────────────────────────────────────────

export class ReviewerDashboardQueryDto {
  @ApiProperty({ description: 'Organization (tenant) ObjectId' })
  @IsMongoId()
  organizationId: string;
}

export class ReviewerAssignmentQueryDto {
  @ApiProperty({ description: 'Organization (tenant) ObjectId' })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({ enum: ReviewStatus, description: 'Filter by review status' })
  @IsOptional()
  @IsIn(Object.values(ReviewStatus))
  status?: ReviewStatus;

  @ApiPropertyOptional({ description: 'Filter to a specific program' })
  @IsOptional()
  @IsMongoId()
  programId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

// ── Response shapes ────────────────────────────────────────────────────────────

/**
 * One assignment card shown in the reviewer's work queue.
 *
 * Blind-review enforcement:
 *   When `blindReview` is true on the parent program, `applicantName` and
 *   `applicantEmail` are omitted regardless of what is stored.  Only
 *   `applicationId` (used to load the form answers) is returned.
 *
 * Ownership: scoped to the requesting reviewer's JWT sub.
 * Privacy: sensitive identity fields follow `isBlind`.
 */
export class ReviewerAssignmentCardDto {
  @ApiProperty() reviewId: string;
  @ApiProperty() applicationId: string;
  @ApiProperty() programId: string;
  @ApiProperty() programTitle: string;
  @ApiProperty({ enum: ReviewStatus }) status: ReviewStatus;
  @ApiPropertyOptional({ description: 'Applicant display name (omitted under blind review)' })
  applicantName?: string;
  @ApiPropertyOptional({ description: 'ISO deadline set by the program committee' })
  reviewDeadline?: Date;
  /** True when the reviewer has a declared conflict of interest on this application. */
  @ApiProperty() hasConflict: boolean;
  /** True when reviewDeadline has passed. */
  @ApiProperty() isOverdue: boolean;
  /** Deeplink hint for the UI to navigate directly to the review form. */
  @ApiProperty() nextAction: string;
}

/**
 * Aggregate workload counts for the reviewer's dashboard landing page.
 *
 * Counts are derived live from ScholarshipReview documents owned by this
 * reviewer — they always match the assignments list.
 */
export class ReviewerWorkloadDto {
  @ApiProperty() reviewerId: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() totalAssigned: number;
  @ApiProperty() totalPending: number;
  @ApiProperty() totalCompleted: number;
  @ApiProperty() totalAbstained: number;
  @ApiProperty() totalOverdue: number;
  @ApiProperty({ description: 'Completion rate in [0,1]' }) completionRate: number;
  @ApiProperty() computedAt: Date;
}

/**
 * Full reviewer dashboard snapshot.
 *
 * Combines workload totals with the immediate pending assignments and any
 * deadline or conflict flags so the reviewer can see at a glance what needs
 * attention first.
 */
export class ReviewerDashboardSnapshotDto {
  @ApiProperty() reviewerId: string;
  @ApiProperty() organizationId: string;
  @ApiProperty({ type: ReviewerWorkloadDto }) workload: ReviewerWorkloadDto;
  @ApiProperty({ type: [ReviewerAssignmentCardDto] }) pendingAssignments: ReviewerAssignmentCardDto[];
  @ApiProperty({ type: [ReviewerAssignmentCardDto] }) overdueAssignments: ReviewerAssignmentCardDto[];
  @ApiProperty({ description: 'Application IDs where a conflict has been flagged', isArray: true })
  conflictedApplicationIds: string[];
  @ApiProperty() computedAt: Date;
}
