import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
import { MentorshipProgramsModule } from './programs/mentorship-programs.module';

/** Mentorship domain: profiles, availability, trust, cohorts, eligibility, and waitlists. */
@Module({
  imports: [
    MentorAvailabilityModule,
    MentorshipProgramsModule,
    MongooseModule.forFeature([
      { name: MentorTrustSignals.name, schema: MentorTrustSignalsSchema },
      { name: MentorProfile.name, schema: MentorProfileSchema },
      { name: MentorProfileRevision.name, schema: MentorProfileRevisionSchema },
    ]),
  ],
  controllers: [MentorTrustController, MentorProfileController],
  providers: [MentorTrustService, MentorProfileService],
  exports: [MentorAvailabilityModule, MentorshipProgramsModule, MentorTrustService, MentorProfileService],
})
export class MentorshipModule {}
