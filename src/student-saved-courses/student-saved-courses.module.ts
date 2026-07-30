import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentSavedCoursesController } from './student-saved-courses.controller';
import { StudentSavedCoursesService } from './student-saved-courses.service';
import { SavedCourse, SavedCourseSchema } from './schemas/saved-course.schema';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SavedCourse.name, schema: SavedCourseSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
  ],
  controllers: [StudentSavedCoursesController],
  providers: [StudentSavedCoursesService],
})
export class StudentSavedCoursesModule {}
