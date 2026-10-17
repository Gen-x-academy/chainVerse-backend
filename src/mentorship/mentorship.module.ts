import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { MetricsModule } from '../metrics/metrics.module';
import { Enrollment, EnrollmentSchema } from '../student-enrollment/schemas/enrollment.schema';
import { MentorshipAuthGuard } from './shared/mentorship-auth.guard';
import { MentorshipAccessPolicy } from './shared/mentorship-access.policy';
import { MentorshipTelemetry } from './shared/mentorship-telemetry.service';
import { MentorshipAuditService } from './shared/audit/mentorship-audit.service';
import {
  MentorshipAuditEvent,
  MentorshipAuditEventSchema,
} from './shared/audit/mentorship-audit-event.schema';
import { MentorshipProgram, MentorshipProgramSchema } from './programs/schemas/mentorship-program.schema';
import { ProgramReviewer, ProgramReviewerSchema } from './programs/schemas/program-reviewer.schema';
import { MentorshipProgramsService } from './programs/mentorship-programs.service';
import { MentorshipProgramsController } from './programs/mentorship-programs.controller';
import {
  ApplicationFormVersion,
  ApplicationFormVersionSchema,
} from './forms/schemas/application-form-version.schema';
import { MentorshipFormsService } from './forms/mentorship-forms.service';
import { MentorshipFormsController } from './forms/mentorship-forms.controller';
import {
  EligibilityRuleSet,
  EligibilityRuleSetSchema,
} from './eligibility/schemas/eligibility-rule-set.schema';
import {
  EligibilityEvaluation,
  EligibilityEvaluationSchema,
} from './eligibility/schemas/eligibility-evaluation.schema';
import { ApplicantFactsService } from './eligibility/applicant-facts.service';
import { MentorshipEligibilityService } from './eligibility/mentorship-eligibility.service';
import { MentorshipEligibilityController } from './eligibility/mentorship-eligibility.controller';
import {
  MentorshipApplication,
  MentorshipApplicationSchema,
} from './applications/schemas/mentorship-application.schema';
import { MentorshipApplicationsService } from './applications/mentorship-applications.service';
import { MentorshipApplicationsController } from './applications/mentorship-applications.controller';
import {
  ConflictDeclaration,
  ConflictDeclarationSchema,
} from './review-queue/schemas/conflict-declaration.schema';
import { MentorshipReviewQueueService } from './review-queue/mentorship-review-queue.service';
import { MentorshipReviewQueueController } from './review-queue/mentorship-review-queue.controller';
import { MentorshipReviewSweeper } from './review-queue/mentorship-review-sweeper.service';

/**
 * Mentorship applications track:
 * - MENTOR-032 configurable application questions (forms/)
 * - MENTOR-033 eligibility preflight (eligibility/)
 * - MENTOR-034 application review queues (review-queue/)
 *
 * See docs/mentorship/applications.md for the API, privacy boundaries and rollout.
 */
@Module({
  imports: [
    IdempotencyModule,
    MetricsModule,
    MongooseModule.forFeature([
      { name: MentorshipProgram.name, schema: MentorshipProgramSchema },
      { name: ProgramReviewer.name, schema: ProgramReviewerSchema },
      { name: ApplicationFormVersion.name, schema: ApplicationFormVersionSchema },
      { name: EligibilityRuleSet.name, schema: EligibilityRuleSetSchema },
      { name: EligibilityEvaluation.name, schema: EligibilityEvaluationSchema },
      { name: MentorshipApplication.name, schema: MentorshipApplicationSchema },
      { name: ConflictDeclaration.name, schema: ConflictDeclarationSchema },
      { name: MentorshipAuditEvent.name, schema: MentorshipAuditEventSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
  ],
  controllers: [
    MentorshipProgramsController,
    MentorshipFormsController,
    MentorshipEligibilityController,
    MentorshipApplicationsController,
    MentorshipReviewQueueController,
  ],
  providers: [
    MentorshipAuthGuard,
    MentorshipAccessPolicy,
    MentorshipTelemetry,
    MentorshipAuditService,
    MentorshipProgramsService,
    MentorshipFormsService,
    ApplicantFactsService,
    MentorshipEligibilityService,
    MentorshipApplicationsService,
    MentorshipReviewQueueService,
    MentorshipReviewSweeper,
  ],
import { NotificationModule } from '../notification/notification.module';
import { MentorshipApplicationsController } from './mentorship-applications.controller';
import { MentorshipApplicationsService } from './mentorship-applications.service';
import { MentorshipDecisionDispatcher } from './mentorship-decision-dispatcher.service';
import {
  MentorshipApplicationDecision,
  MentorshipApplicationDecisionSchema,
} from './schemas/mentorship-application-decision.schema';
import {
  MentorshipApplication,
  MentorshipApplicationSchema,
} from './schemas/mentorship-application.schema';
import {
  MentorshipDecisionNotification,
  MentorshipDecisionNotificationSchema,
} from './schemas/mentorship-decision-notification.schema';
import {
  MentorshipProgram,
  MentorshipProgramSchema,
} from './schemas/mentorship-program.schema';
import { MentorshipTelemetry } from './telemetry/mentorship.telemetry';

/**
 * Mentorship applications: programs, submissions, structured decisions
 * (MENTOR-035) and withdrawal / reapplication (MENTOR-036).
 * See docs/mentorship/applications.md.
 */
@Module({
  // The @Interval dispatcher relies on ScheduleModule.forRoot(), which is
  // registered globally by StellarModule; registering it again here would
  // start a second scheduler.
  imports: [
    NotificationModule,
    MongooseModule.forFeature([
      { name: MentorshipProgram.name, schema: MentorshipProgramSchema },
      { name: MentorshipApplication.name, schema: MentorshipApplicationSchema },
      {
        name: MentorshipApplicationDecision.name,
        schema: MentorshipApplicationDecisionSchema,
      },
      {
        name: MentorshipDecisionNotification.name,
        schema: MentorshipDecisionNotificationSchema,
      },
    ]),
  ],
  controllers: [MentorshipApplicationsController],
  providers: [
    MentorshipApplicationsService,
    MentorshipDecisionDispatcher,
    MentorshipTelemetry,
  ],
  exports: [MentorshipApplicationsService],
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { MetricsModule } from '../metrics/metrics.module';
import { MatchProposalService } from './match-proposal.service';
import { MentorshipAccessGuard } from './mentorship-access.guard';
import { MentorshipCapacityService } from './mentorship-capacity.service';
import { MentorshipCoordinatorController } from './mentorship-coordinator.controller';
import { MentorshipCoordinatorService } from './mentorship-coordinator.service';
import { MentorshipEligibilityService } from './mentorship-eligibility.service';
import { MentorshipProfileService } from './mentorship-profile.service';
import { MentorshipSweeper } from './mentorship-sweeper.service';
import { MentorshipTelemetry } from './mentorship-telemetry.service';
import { MentorshipController } from './mentorship.controller';
import {
  MatchProposal,
  MatchProposalSchema,
} from './schemas/match-proposal.schema';
import {
  MentorshipBlock,
  MentorshipBlockSchema,
} from './schemas/mentorship-block.schema';
import {
  MentorshipEngagement,
  MentorshipEngagementSchema,
} from './schemas/mentorship-engagement.schema';
import {
  MentorshipProfile,
  MentorshipProfileSchema,
} from './schemas/mentorship-profile.schema';

/**
 * Mentor matching: proposals (MENTOR-037), mutual acceptance (MENTOR-038)
 * and coordinator-assisted matching (MENTOR-039). See docs/mentorship/matching.md.
 *
 * Relies on the global AuditModule, EventEmitterModule and the
 * ScheduleModule registered by StellarModule.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MatchProposal.name, schema: MatchProposalSchema },
      { name: MentorshipEngagement.name, schema: MentorshipEngagementSchema },
      { name: MentorshipProfile.name, schema: MentorshipProfileSchema },
      { name: MentorshipBlock.name, schema: MentorshipBlockSchema },
    ]),
    IdempotencyModule,
    MetricsModule,
  ],
  controllers: [MentorshipController, MentorshipCoordinatorController],
  providers: [
    MatchProposalService,
    MentorshipCoordinatorService,
    MentorshipProfileService,
    MentorshipEligibilityService,
    MentorshipCapacityService,
    MentorshipTelemetry,
    MentorshipSweeper,
    MentorshipAccessGuard,
  ],
  exports: [MatchProposalService],
import { MentorAvailabilityModule } from './availability/availability.module';
import { MentorTrustController } from './trust/trust.controller';
import { MentorTrustService } from './trust/trust.service';
import { MentorTrustSignals, MentorTrustSignalsSchema } from './trust/trust-signals.schema';
import { MentorProfileController } from './mentor-profile/mentor-profile.controller';
import { MentorProfileService } from './mentor-profile/mentor-profile.service';
import {
  MentorProfile,
  MentorProfileRevision,
  MentorProfileRevisionSchema,
  MentorProfileSchema,
} from './mentor-profile/schemas/mentor-profile.schema';
import { MentorshipProgramController } from './programs/mentorship-program.controller';
import { MentorshipProgramService } from './programs/mentorship-program.service';
import {
  MentorshipProgram,
  MentorshipProgramSchema,
} from './programs/mentorship-program.schema';
import { MentorDirectoryController } from './directory/mentor-directory.controller';
import { MentorDirectoryService } from './directory/mentor-directory.service';

@Module({
  imports: [
    MentorAvailabilityModule,
    MongooseModule.forFeature([
      { name: MentorTrustSignals.name, schema: MentorTrustSignalsSchema },
      { name: MentorProfile.name, schema: MentorProfileSchema },
      { name: MentorProfileRevision.name, schema: MentorProfileRevisionSchema },
      { name: MentorshipProgram.name, schema: MentorshipProgramSchema },
    ]),
  ],
  controllers: [
    MentorTrustController,
    MentorProfileController,
    MentorshipProgramController,
    MentorDirectoryController,
  ],
  providers: [
    MentorTrustService,
    MentorProfileService,
    MentorshipProgramService,
    MentorDirectoryService,
  ],
  exports: [MentorAvailabilityModule, MentorTrustService, MentorProfileService],
})
export class MentorshipModule {}
