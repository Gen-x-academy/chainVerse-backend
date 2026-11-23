import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipFeedbackController } from './mentorship-feedback.controller';
import { MentorshipFeedbackService } from './mentorship-feedback.service';
import {
  MentorshipSessionFeedback,
  MentorshipSessionFeedbackSchema,
} from './schemas/mentorship-feedback.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: MentorshipSessionFeedback.name,
        schema: MentorshipSessionFeedbackSchema,
      },
    ]),
  ],
  controllers: [MentorshipFeedbackController],
  providers: [MentorshipFeedbackService],
  exports: [MentorshipFeedbackService],
})
export class MentorshipFeedbackModule {}
