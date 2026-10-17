import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorAvailabilityModule } from './availability/availability.module';
import { MentorTrustController } from './trust/trust.controller';
import { MentorTrustService } from './trust/trust.service';
import { MentorTrustSignals, MentorTrustSignalsSchema } from './trust/trust-signals.schema';
import { MentorProfileController } from './mentor-profile/mentor-profile.controller';
import { MentorProfileService } from './mentor-profile/mentor-profile.service';
import { MentorProfile, MentorProfileRevision, MentorProfileRevisionSchema, MentorProfileSchema } from './mentor-profile/schemas/mentor-profile.schema';
import { MentorshipTelemetryService } from './mentorship-telemetry.service';
import { MentorshipProgram, MentorshipProgramSchema } from './program/mentorship-program.schema';
import { MentorshipProgramController } from './program/mentorship-program.controller';
import { MentorshipProgramService } from './program/mentorship-program.service';
import { MentorshipFacilitator, MentorshipFacilitatorSchema } from './facilitators/mentorship-facilitator.schema';
import { MentorshipFacilitatorController } from './facilitators/mentorship-facilitator.controller';
import { MentorshipFacilitatorService } from './facilitators/mentorship-facilitator.service';

/** Mentorship domain, including MENTOR-020 delivery configuration and MENTOR-021 scoped staffing. */
@Module({
  imports: [
    MentorAvailabilityModule,
    MongooseModule.forFeature([
      { name: MentorTrustSignals.name, schema: MentorTrustSignalsSchema },
      { name: MentorProfile.name, schema: MentorProfileSchema },
      { name: MentorProfileRevision.name, schema: MentorProfileRevisionSchema },
      { name: MentorshipProgram.name, schema: MentorshipProgramSchema },
      { name: MentorshipFacilitator.name, schema: MentorshipFacilitatorSchema },
    ]),
  ],
  controllers: [MentorTrustController, MentorProfileController, MentorshipProgramController, MentorshipFacilitatorController],
  providers: [MentorTrustService, MentorProfileService, MentorshipTelemetryService, MentorshipProgramService, MentorshipFacilitatorService],
  exports: [MentorAvailabilityModule, MentorTrustService, MentorProfileService, MentorshipProgramService, MentorshipFacilitatorService],
})
export class MentorshipModule {}
