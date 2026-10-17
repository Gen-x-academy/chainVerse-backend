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
