import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipTimelineController } from './mentorship-timeline.controller';
import { MentorshipTimelineService } from './mentorship-timeline.service';
import {
  MentorshipTimelineEvent,
  MentorshipTimelineEventSchema,
} from './schemas/mentorship-timeline-event.schema';

/**
 * Mentorship progress timeline (MENTOR-075): an ordered, permission-filtered
 * view of goals, sessions, milestones, deliverables, decisions and agreement
 * changes for one engagement.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: MentorshipTimelineEvent.name,
        schema: MentorshipTimelineEventSchema,
      },
    ]),
  ],
  controllers: [MentorshipTimelineController],
  providers: [MentorshipTimelineService],
  exports: [MentorshipTimelineService],
})
export class MentorshipTimelineModule {}
