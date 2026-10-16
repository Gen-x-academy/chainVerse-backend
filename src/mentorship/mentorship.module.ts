import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
