import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
