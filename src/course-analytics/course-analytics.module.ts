import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseAnalyticsController } from './course-analytics.controller';
import { CourseAnalyticsService } from './course-analytics.service';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from '../student-enrollment/schemas/enrollment.schema';
import {
  CourseRating,
  CourseRatingSchema,
} from '../course-ratings-feedback/schemas/course-rating.schema';
import {
  SavedCourse,
  SavedCourseSchema,
} from '../student-saved-courses/schemas/saved-course.schema';
import {
  CartItem,
  CartItemSchema,
} from '../student-cart/schemas/cart-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: CourseRating.name, schema: CourseRatingSchema },
      { name: SavedCourse.name, schema: SavedCourseSchema },
      { name: CartItem.name, schema: CartItemSchema },
    ]),
  ],
  controllers: [CourseAnalyticsController],
  providers: [CourseAnalyticsService],
  exports: [CourseAnalyticsService],
})
export class CourseAnalyticsModule {}
