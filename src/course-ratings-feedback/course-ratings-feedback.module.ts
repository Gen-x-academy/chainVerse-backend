import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseRatingsFeedbackController } from './course-ratings-feedback.controller';
import { CourseRatingsFeedbackService } from './course-ratings-feedback.service';
import {
  CourseRating,
  CourseRatingSchema,
} from './schemas/course-rating.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CourseRating.name, schema: CourseRatingSchema },
    ]),
  ],
  controllers: [CourseRatingsFeedbackController],
  providers: [CourseRatingsFeedbackService],
})
export class CourseRatingsFeedbackModule {}
