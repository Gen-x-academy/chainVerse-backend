import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorAvailabilityController } from './availability.controller';
import { MentorAvailabilityService } from './availability.service';
import {
  MentorAvailabilityChange,
  MentorAvailabilityChangeSchema,
} from './schemas/mentor-availability-change.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: MentorAvailabilityChange.name,
        schema: MentorAvailabilityChangeSchema,
      },
    ]),
  ],
  controllers: [MentorAvailabilityController],
  providers: [MentorAvailabilityService],
  exports: [MentorAvailabilityService],
})
export class MentorAvailabilityModule {}
