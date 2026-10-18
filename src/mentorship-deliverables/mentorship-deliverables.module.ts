import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipDeliverablesController } from './mentorship-deliverables.controller';
import { MentorshipDeliverablesService } from './mentorship-deliverables.service';
import {
  MentorshipDeliverable,
  MentorshipDeliverableReview,
  MentorshipDeliverableReviewSchema,
  MentorshipDeliverableSchema,
} from './schemas/mentorship-deliverable.schema';

/**
 * Mentorship deliverable submissions and reviews
 * (MENTOR-073 submit deliverables, MENTOR-074 review and accept deliverables).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorshipDeliverable.name, schema: MentorshipDeliverableSchema },
      {
        name: MentorshipDeliverableReview.name,
        schema: MentorshipDeliverableReviewSchema,
      },
    ]),
  ],
  controllers: [MentorshipDeliverablesController],
  providers: [MentorshipDeliverablesService],
  exports: [MentorshipDeliverablesService],
})
export class MentorshipDeliverablesModule {}
