import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from '../organization-member/schemas/organization-member.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramSchema,
} from '../scholarships/schemas/scholarship-program.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationSchema,
} from '../scholarships/schemas/scholarship-application.schema';
import {
  ScholarshipReview,
  ScholarshipReviewSchema,
} from '../scholarships/schemas/scholarship-review.schema';
import {
  BudgetLedger,
  BudgetLedgerSchema,
  BudgetReservation,
  BudgetReservationSchema,
} from '../scholarships/schemas/budget-reservation.schema';
import { ScholarshipSponsorDashboardService } from './scholarship-sponsor-dashboard.service';
import { ScholarshipSponsorDashboardController } from './scholarship-sponsor-dashboard.controller';

/**
 * ScholarshipSponsorDashboardModule
 *
 * Exposes the sponsor-facing scholarship dashboard:
 *   - Organisation snapshot (totals, budget summary, top programmes)
 *   - Per-programme budget summaries with commitment ratios
 *   - Application funnel counts and conversion rates
 *   - Review-completion progress
 *   - Award and disbursement summaries with reconciliation flag
 *   - Impact indicator reports for stakeholder export
 *
 * Ownership: OWNER and ADMIN organisation roles.
 * Privacy: no applicant identity is exposed — counts and amounts only.
 * Migration: reads only existing collections; no new schema is introduced.
 * Operational impact: all handlers are read-only aggregations.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      // Required by OrganizationRolesGuard to verify tenant membership.
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      // Read references — these collections are owned by ScholarshipsModule.
      { name: ScholarshipProgram.name, schema: ScholarshipProgramSchema },
      { name: ScholarshipApplication.name, schema: ScholarshipApplicationSchema },
      { name: ScholarshipReview.name, schema: ScholarshipReviewSchema },
      { name: BudgetLedger.name, schema: BudgetLedgerSchema },
      { name: BudgetReservation.name, schema: BudgetReservationSchema },
    ]),
  ],
  controllers: [ScholarshipSponsorDashboardController],
  providers: [ScholarshipSponsorDashboardService, OrganizationRolesGuard],
  exports: [ScholarshipSponsorDashboardService],
})
export class ScholarshipSponsorDashboardModule {}
