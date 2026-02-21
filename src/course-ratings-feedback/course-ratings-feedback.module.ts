import { Module } from '@nestjs/common';
import { CourseRatingsFeedbackController } from './course-ratings-feedback.controller';
import { CourseRatingsFeedbackService } from './course-ratings-feedback.service';

@Module({
  controllers: [CourseRatingsFeedbackController],
  providers: [CourseRatingsFeedbackService],
})
export class CourseRatingsFeedbackModule {}
