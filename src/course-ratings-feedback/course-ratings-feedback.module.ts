import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseRatingsFeedbackController } from './course-ratings-feedback.controller';
import { CourseRatingsFeedbackService } from './course-ratings-feedback.service';
import {
  CourseRating,
  CourseRatingSchema,
} from './schemas/course-rating.schema';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from '../student-enrollment/schemas/enrollment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CourseRating.name, schema: CourseRatingSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
  ],
  controllers: [CourseRatingsFeedbackController],
  providers: [CourseRatingsFeedbackService],
})
export class CourseRatingsFeedbackModule {}
