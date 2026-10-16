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
})
export class MentorshipModule {}
