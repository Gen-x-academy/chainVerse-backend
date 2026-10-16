import {
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScholarshipApplicationStatus } from '../../scholarships/schemas/scholarship-application.schema';
import { ScholarshipProgramStatus } from '../../scholarships/schemas/scholarship-program.schema';

// ── Query DTOs ────────────────────────────────────────────────────────────────

export class DiscoverProgramsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by program status (defaults to published)',
    enum: ScholarshipProgramStatus,
  })
  @IsOptional()
  @IsIn(Object.values(ScholarshipProgramStatus))
  status?: ScholarshipProgramStatus;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Results per page', default: 20 })
  @IsOptional()
  limit?: number = 20;
}

export class ApplicationStatusQueryDto {
  @ApiPropertyOptional({
    description: 'Filter applications by status',
    enum: ScholarshipApplicationStatus,
  })
  @IsOptional()
  @IsIn(Object.values(ScholarshipApplicationStatus))
  status?: ScholarshipApplicationStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number = 20;
}

// ── Draft DTOs ────────────────────────────────────────────────────────────────

export class SaveDraftDto {
  @ApiProperty({ description: 'Scholarship program ObjectId' })
  @IsMongoId()
  programId: string;

  @ApiProperty({ description: 'Organization (tenant) that owns the program' })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({
    description: 'Partial answers keyed by form-field ObjectId',
  })
  @IsOptional()
  answers?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Personal statement draft', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  statement?: string;
}

export class SubmitDraftDto {
  @ApiPropertyOptional({ description: 'Final answers keyed by form-field ObjectId' })
  @IsOptional()
  answers?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Final personal statement', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  statement?: string;
}

// ── Request info response ─────────────────────────────────────────────────────

export class RespondToInfoRequestDto {
  @ApiProperty({ description: 'Map of question id → answer text' })
  answers: Record<string, string>;
}

// ── Response shapes (plain objects returned by service) ──────────────────────

/**
 * Slim program card shown in the discovery list.
 *
 * Ownership: public-facing data scoped to published programs.  No internal
 * financial or review metadata is included.
 */
export class ProgramCardDto {
  @ApiProperty() programId: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ enum: ScholarshipProgramStatus }) status: ScholarshipProgramStatus;
  @ApiPropertyOptional() applicationDeadline?: Date;
  @ApiPropertyOptional() awardValue?: number;
  @ApiPropertyOptional() awardCurrency?: string;
  /** Whether this applicant already has a submission or draft for this program. */
  @ApiProperty() applicantHasApplied: boolean;
}

/**
 * Actionable application card shown in "My Applications".
 *
 * Ownership: scoped to the requesting applicant via `applicantId`.
 * Privacy: no reviewer identities or rubric scores are included.
 */
export class ApplicationStatusCardDto {
  @ApiProperty() applicationId: string;
  @ApiProperty() programId: string;
  @ApiProperty() programTitle: string;
  @ApiProperty({ enum: ScholarshipApplicationStatus }) status: ScholarshipApplicationStatus;
  @ApiPropertyOptional() submittedAt?: Date;
  @ApiPropertyOptional() decidedAt?: Date;
  @ApiPropertyOptional() decisionReason?: string;
  /** True when there is an open info-request awaiting the applicant's response. */
  @ApiProperty() hasPendingInfoRequest: boolean;
  /** Deeplink to the next required action, if any. */
  @ApiPropertyOptional() nextAction?: string;
}

/**
 * Student dashboard snapshot — aggregated counts and recent activity.
 *
 * Ownership: computed on-demand from live data; not persisted.
 * Privacy: counts only; no individual application details exposed at this level.
 */
export class StudentDashboardSnapshotDto {
  @ApiProperty() applicantId: string;
  @ApiProperty() totalDrafts: number;
  @ApiProperty() totalSubmitted: number;
  @ApiProperty() totalUnderReview: number;
  @ApiProperty() totalApproved: number;
  @ApiProperty() totalRejected: number;
  @ApiProperty() totalWithdrawn: number;
  @ApiProperty({ type: [ApplicationStatusCardDto] }) recentApplications: ApplicationStatusCardDto[];
  @ApiProperty({ isArray: true }) openInfoRequests: string[];
  @ApiProperty() computedAt: Date;
}
