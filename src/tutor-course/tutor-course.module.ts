import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TutorCourseController } from './tutor-course.controller';
import { AdminCourseService } from '../admin-course/admin-course.service';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';
import { Tutor, TutorSchema } from '../tutor/schemas/tutor.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Tutor.name, schema: TutorSchema },
    ]),
  ],
  controllers: [TutorCourseController],
  providers: [AdminCourseService],
  exports: [AdminCourseService],
})
export class TutorCourseModule {}
