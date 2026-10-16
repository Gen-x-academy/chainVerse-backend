import { IsMongoId, IsOptional, IsIn, IsDateString, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScholarshipApplicationStatus } from '../../scholarships/schemas/scholarship-application.schema';
import { ScholarshipProgramStatus } from '../../scholarships/schemas/scholarship-program.schema';

// ── Query DTOs ────────────────────────────────────────────────────────────────

export class SponsorDashboardQueryDto {
  @ApiProperty({ description: 'Organization (sponsor tenant) ObjectId' })
  @IsMongoId()
  organizationId: string;
}

export class ProgramSummaryQueryDto {
  @ApiProperty({ description: 'Organization (sponsor tenant) ObjectId' })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({
    description: 'Filter by program status',
    enum: ScholarshipProgramStatus,
  })
  @IsOptional()
  @IsIn(Object.values(ScholarshipProgramStatus))
  status?: ScholarshipProgramStatus;

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

export class ImpactReportQueryDto {
  @ApiProperty({ description: 'Organization (sponsor tenant) ObjectId' })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({ description: 'Filter to a specific program ObjectId' })
  @IsOptional()
  @IsMongoId()
  programId?: string;

  @ApiPropertyOptional({ description: 'Start of reporting window (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'End of reporting window (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

// ── Response shapes ───────────────────────────────────────────────────────────

/**
 * Per-program funding and funnel summary card.
 *
 * Ownership: sponsor-scoped — all values reflect a single organizationId.
 * Privacy: no applicant identity data; counts only.
 *
 * Freshness: computed live; `computedAt` indicates when the values were derived.
 * Callers should treat results older than 5 minutes as potentially stale for
 * high-frequency dashboards.
 */
export class ProgramBudgetSummaryDto {
  @ApiProperty() programId: string;
  @ApiProperty() programTitle: string;
  @ApiProperty({ enum: ScholarshipProgramStatus }) status: ScholarshipProgramStatus;
  @ApiProperty({ description: 'Total configured budget in currency units' }) totalBudget: number;
  @ApiProperty({ description: 'Amount currently held by PENDING reservations' }) reservedAmount: number;
  @ApiProperty({ description: 'Amount disbursed (CONFIRMED reservations)' }) disbursedAmount: number;
  @ApiProperty({ description: 'Remaining available budget' }) availableAmount: number;
  @ApiProperty() currency: string;
  @ApiProperty({ description: 'Percentage of budget committed (reserved + disbursed)' }) commitmentRatio: number;
  @ApiProperty() computedAt: Date;
}

/**
 * Application funnel counts for one program.
 *
 * All statuses from the ScholarshipApplicationStatus enum are represented so
 * sponsors can track drop-off at each stage.
 */
export class ApplicationFunnelDto {
  @ApiProperty() programId: string;
  @ApiProperty() programTitle: string;
  @ApiProperty() totalReceived: number;
  @ApiProperty() totalUnderReview: number;
  @ApiProperty() totalApproved: number;
  @ApiProperty() totalRejected: number;
  @ApiProperty() totalWithdrawn: number;
  @ApiProperty({ description: 'Review completion rate in [0,1]' }) reviewCompletionRate: number;
  @ApiProperty({ description: 'Approval rate in [0,1]' }) approvalRate: number;
  @ApiProperty() computedAt: Date;
}

/**
 * Review progress snapshot for one program.
 *
 * Shows how many applications still have pending reviews so sponsors can
 * monitor committee throughput without accessing reviewer identities.
 */
export class ReviewProgressDto {
  @ApiProperty() programId: string;
  @ApiProperty() totalApplicationsUnderReview: number;
  @ApiProperty() applicationsWithAllReviewsComplete: number;
  @ApiProperty() applicationsWithPendingReviews: number;
  @ApiProperty({ description: 'Average number of completed reviews per application' }) avgReviewsPerApplication: number;
  @ApiProperty() computedAt: Date;
}

/**
 * Award and disbursement summary — cross-program or per-program.
 *
 * Financial values reconcile with ledger entries in the scholarship-finance
 * domain.  Any discrepancy surfaces as `reconciliationWarning = true`.
 */
export class AwardDisbursementSummaryDto {
  @ApiProperty() organizationId: string;
  @ApiPropertyOptional() programId?: string;
  @ApiProperty() totalAwardsMade: number;
  @ApiProperty({ description: 'Sum of all confirmed reservation amounts' }) totalAwardedAmount: number;
  @ApiProperty({ description: 'Sum of amounts that have been paid out to recipients' }) totalPaidAmount: number;
  @ApiProperty({ description: 'Amount awarded but not yet paid' }) pendingDisbursementAmount: number;
  @ApiProperty() currency: string;
  @ApiProperty({ description: 'True when totals diverge from ledger entries by > 0.01' }) reconciliationWarning: boolean;
  @ApiProperty() computedAt: Date;
}

/**
 * Impact indicator summary shown on the sponsor's main dashboard page.
 *
 * Aggregated across programs in a given date window.  Provides top-level
 * counts to convey programme impact to sponsors and their stakeholders.
 */
export class SponsorImpactReportDto {
  @ApiProperty() organizationId: string;
  @ApiPropertyOptional() programId?: string;
  @ApiPropertyOptional() from?: Date;
  @ApiPropertyOptional() to?: Date;
  @ApiProperty() totalProgramsLaunched: number;
  @ApiProperty() totalApplicants: number;
  @ApiProperty() totalRecipients: number;
  @ApiProperty({ description: 'Total monetary value awarded in the period' }) totalAmountAwarded: number;
  @ApiProperty() currency: string;
  @ApiProperty({ description: 'Percentage of applicants who received awards' }) awardRate: number;
  @ApiProperty() computedAt: Date;
}

/**
 * Sponsor dashboard landing snapshot — all key figures in one response.
 */
export class SponsorDashboardSnapshotDto {
  @ApiProperty() organizationId: string;
  @ApiProperty() totalPrograms: number;
  @ApiProperty() programsByStatus: Record<string, number>;
  @ApiProperty() totalApplicationsReceived: number;
  @ApiProperty() totalAwardsMade: number;
  @ApiProperty({ description: 'Combined budget across all programs' }) totalBudgetAllocated: number;
  @ApiProperty() totalBudgetDisbursed: number;
  @ApiProperty() totalBudgetAvailable: number;
  @ApiProperty() currency: string;
  @ApiProperty({ type: [ProgramBudgetSummaryDto] }) topPrograms: ProgramBudgetSummaryDto[];
  @ApiProperty() computedAt: Date;
}
