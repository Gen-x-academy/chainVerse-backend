import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipLifecycleService } from './mentorship-lifecycle.service';
import {
  MentorshipLifecycle,
  MentorshipLifecycleEvent,
  MentorshipLifecycleEventSchema,
  MentorshipLifecycleSchema,
} from './schemas/mentorship-lifecycle.schema';

/**
 * Mentorship lifecycle state machine (MENTOR-004). Exports the service for the
 * mentorship features that need to move a mentorship between states; it exposes no
 * HTTP routes of its own.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorshipLifecycle.name, schema: MentorshipLifecycleSchema },
      { name: MentorshipLifecycleEvent.name, schema: MentorshipLifecycleEventSchema },
    ]),
  ],
  providers: [MentorshipLifecycleService],
  exports: [MentorshipLifecycleService],
})
export class MentorshipLifecycleModule {}
