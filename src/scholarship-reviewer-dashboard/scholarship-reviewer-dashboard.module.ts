import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from '../organization-member/schemas/organization-member.schema';
import {
  ScholarshipReview,
  ScholarshipReviewSchema,
} from '../scholarships/schemas/scholarship-review.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramSchema,
} from '../scholarships/schemas/scholarship-program.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationSchema,
} from '../scholarships/schemas/scholarship-application.schema';
import {
  CommitteeDecision,
  CommitteeDecisionSchema,
} from '../scholarships/schemas/committee-decision.schema';
import { ScholarshipReviewerDashboardService } from './scholarship-reviewer-dashboard.service';
import { ScholarshipReviewerDashboardController } from './scholarship-reviewer-dashboard.controller';

/**
 * ScholarshipReviewerDashboardModule
 *
 * Exposes the reviewer-facing scholarship dashboard:
 *   - Full dashboard snapshot (workload + pending + overdue + conflicts)
 *   - Workload counts by status
 *   - Paginated assignment work queue with blind-review identity enforcement
 *   - Individual review document retrieval (for form rendering)
 *   - Conflict-of-interest detection (cross-checks CommitteeDecision authorship)
 *
 * Ownership: INSTRUCTOR, ADMIN, or OWNER organisation members.
 * Privacy:
 *   - Each reviewer only sees their own assignments (JWT sub scoping).
 *   - Applicant identity follows per-programme blind-review settings.
 *   - Other reviewers' scores are never returned.
 * Migration: reads only existing collections; no new schema is introduced.
 * Operational impact: all handlers are read-only.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      { name: ScholarshipReview.name, schema: ScholarshipReviewSchema },
      { name: ScholarshipProgram.name, schema: ScholarshipProgramSchema },
      { name: ScholarshipApplication.name, schema: ScholarshipApplicationSchema },
      { name: CommitteeDecision.name, schema: CommitteeDecisionSchema },
    ]),
  ],
  controllers: [ScholarshipReviewerDashboardController],
  providers: [ScholarshipReviewerDashboardService, OrganizationRolesGuard],
  exports: [ScholarshipReviewerDashboardService],
})
export class ScholarshipReviewerDashboardModule {}
