import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseRatingsFeedbackController } from './course-ratings-feedback.controller';
import { CourseRatingsFeedbackService } from './course-ratings-feedback.service';
import {
  CourseRating,
  CourseRatingSchema,
} from './schemas/course-rating.schema';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CourseRating.name, schema: CourseRatingSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
  ],
  controllers: [CourseRatingsFeedbackController],
  providers: [CourseRatingsFeedbackService],
})
export class CourseRatingsFeedbackModule {}
