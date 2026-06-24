import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminCourseController } from './admin-course.controller';
import { AdminCourseService } from './admin-course.service';
import { Course, CourseSchema } from './schemas/course.schema';
import { Tutor, TutorSchema } from '../tutor/schemas/tutor.schema';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Tutor.name, schema: TutorSchema },
    ]),
    EmailModule,
  ],
  controllers: [AdminCourseController],
  providers: [AdminCourseService],
  exports: [AdminCourseService],
})
export class AdminCourseModule {}
