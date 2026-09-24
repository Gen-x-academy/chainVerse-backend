import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TutorCourseController } from './tutor-course.controller';
import { TutorCourseService } from './tutor-course.service';
import { AdminCourseService } from '../admin-course/admin-course.service';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';
import { Tutor, TutorSchema } from '../tutor/schemas/tutor.schema';

import { AdminCourseModule } from '../admin-course/admin-course.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Tutor.name, schema: TutorSchema },
    ]),
    AdminCourseModule,
  ],
  controllers: [TutorCourseController],
  providers: [TutorCourseService],
  exports: [TutorCourseService],
})
export class TutorCourseModule {}
