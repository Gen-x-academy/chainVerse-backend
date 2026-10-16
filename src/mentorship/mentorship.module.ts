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
import { MentorAvailabilityModule } from './availability/availability.module';
import { MentorTrustController } from './trust/trust.controller';
import { MentorTrustService } from './trust/trust.service';
import {
  MentorTrustSignals,
  MentorTrustSignalsSchema,
} from './trust/trust-signals.schema';

@Module({
  imports: [
    MentorAvailabilityModule,
    MongooseModule.forFeature([
      { name: MentorTrustSignals.name, schema: MentorTrustSignalsSchema },
    ]),
  ],
  controllers: [MentorTrustController],
  providers: [MentorTrustService],
  exports: [MentorAvailabilityModule, MentorTrustService],
import { MentorProfileController } from './mentor-profile/mentor-profile.controller';
import { MentorProfileService } from './mentor-profile/mentor-profile.service';
import {
  MentorProfile,
  MentorProfileRevision,
  MentorProfileRevisionSchema,
  MentorProfileSchema,
} from './mentor-profile/schemas/mentor-profile.schema';

/** Mentorship domain. Starts with mentor professional profiles (MENTOR-008). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorProfile.name, schema: MentorProfileSchema },
      { name: MentorProfileRevision.name, schema: MentorProfileRevisionSchema },
    ]),
  ],
  controllers: [MentorProfileController],
  providers: [MentorProfileService],
  exports: [MentorProfileService],
})
export class MentorshipModule {}
