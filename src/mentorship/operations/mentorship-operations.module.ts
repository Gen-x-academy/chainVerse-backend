import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipAccessGuard } from '../mentorship-access.guard';
import {
  ApplicationRead,
  ApplicationReadSchema,
} from './schemas/application-read.schema';
import {
  EligibilityEvaluationRead,
  EligibilityEvaluationReadSchema,
} from './schemas/eligibility-evaluation-read.schema';
import {
  Cohort,
  CohortSchema,
  CohortEnrollment,
  CohortEnrollmentSchema,
} from '../programs/schemas/program.schema';
import {
  MatchProposal,
  MatchProposalSchema,
} from '../schemas/match-proposal.schema';
import {
  MentorshipEngagement,
  MentorshipEngagementSchema,
} from '../schemas/mentorship-engagement.schema';
import {
  MentorshipProfile,
  MentorshipProfileSchema,
} from '../schemas/mentorship-profile.schema';
import { CoordinatorDashboardController } from './controllers/coordinator-dashboard.controller';
import { MentorDashboardController } from './controllers/mentor-dashboard.controller';
import { MentorshipAnalyticsController } from './controllers/mentorship-analytics.controller';
import { MentorshipDisputesController } from './controllers/mentorship-disputes.controller';
import { CoordinatorDashboardService } from './services/coordinator-dashboard.service';
import { InterventionsService } from './services/interventions.service';
import { MentorDashboardService } from './services/mentor-dashboard.service';
import { MentorshipAnalyticsService } from './services/mentorship-analytics.service';
import { MentorshipDisputesService } from './services/mentorship-disputes.service';
import { MentorshipOpsWorkflowService } from './services/mentorship-ops-workflow.service';
import {
  MentorshipAlert,
  MentorshipAlertSchema,
} from './schemas/mentorship-alert.schema';
import {
  MentorshipDashboardFilter,
  MentorshipDashboardFilterSchema,
} from './schemas/mentorship-dashboard-filter.schema';
import {
  MentorshipOpsDispute,
  MentorshipOpsDisputeSchema,
} from './schemas/mentorship-ops-dispute.schema';
import {
  MentorshipIntervention,
  MentorshipInterventionSchema,
} from './schemas/mentorship-intervention.schema';
import {
  MentorshipOpsMilestone,
  MentorshipOpsMilestoneSchema,
} from './schemas/mentorship-ops-milestone.schema';
import {
  MentorshipOpsJobRun,
  MentorshipOpsJobRunSchema,
} from './schemas/mentorship-ops-job-run.schema';
import {
  MentorshipSession,
  MentorshipSessionSchema,
} from './schemas/mentorship-session.schema';
import {
  MentorshipTask,
  MentorshipTaskSchema,
} from './schemas/mentorship-task.schema';

/**
 * Mentorship operations dashboards (MENTOR-114/115/116, issues #1431-#1434).
 *
 * Deliberately standalone: it registers every schema it reads directly (via
 * clean schema files) instead of importing the root mentorship module, so
 * these read models and the background workflow keep working independently
 * of the matching/lifecycle write path.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApplicationRead.name, schema: ApplicationReadSchema },
      {
        name: EligibilityEvaluationRead.name,
        schema: EligibilityEvaluationReadSchema,
      },
      { name: Cohort.name, schema: CohortSchema },
      { name: CohortEnrollment.name, schema: CohortEnrollmentSchema },
      { name: MatchProposal.name, schema: MatchProposalSchema },
      { name: MentorshipEngagement.name, schema: MentorshipEngagementSchema },
      { name: MentorshipProfile.name, schema: MentorshipProfileSchema },
      { name: MentorshipSession.name, schema: MentorshipSessionSchema },
      { name: MentorshipTask.name, schema: MentorshipTaskSchema },
      {
        name: MentorshipOpsMilestone.name,
        schema: MentorshipOpsMilestoneSchema,
      },
      { name: MentorshipOpsDispute.name, schema: MentorshipOpsDisputeSchema },
      { name: MentorshipAlert.name, schema: MentorshipAlertSchema },
      {
        name: MentorshipIntervention.name,
        schema: MentorshipInterventionSchema,
      },
      {
        name: MentorshipDashboardFilter.name,
        schema: MentorshipDashboardFilterSchema,
      },
      { name: MentorshipOpsJobRun.name, schema: MentorshipOpsJobRunSchema },
    ]),
  ],
  controllers: [
    MentorshipAnalyticsController,
    MentorDashboardController,
    CoordinatorDashboardController,
    MentorshipDisputesController,
  ],
  providers: [
    MentorshipAccessGuard,
    MentorshipAnalyticsService,
    MentorDashboardService,
    CoordinatorDashboardService,
    MentorshipDisputesService,
    InterventionsService,
    MentorshipOpsWorkflowService,
  ],
})
export class MentorshipOperationsModule {}
