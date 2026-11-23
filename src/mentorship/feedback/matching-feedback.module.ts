import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { FeedbackPolicy } from './feedback.policy';
import { MatchingFeedbackController } from './matching-feedback.controller';
import { MatchingFeedbackService } from './matching-feedback.service';
import {
  MatchingFeedback,
  MatchingFeedbackSchema,
} from './schemas/matching-feedback.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MatchingFeedback.name, schema: MatchingFeedbackSchema },
    ]),
    MetricsModule,
  ],
  controllers: [MatchingFeedbackController],
  providers: [MatchingFeedbackService, FeedbackPolicy, MentorshipTelemetry],
  exports: [MatchingFeedbackService],
})
export class MatchingFeedbackModule {}
