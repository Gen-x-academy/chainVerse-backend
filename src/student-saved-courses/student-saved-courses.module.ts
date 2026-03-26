import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentSavedCoursesController } from './student-saved-courses.controller';
import { StudentSavedCoursesService } from './student-saved-courses.service';
import { SavedCourse, SavedCourseSchema } from './schemas/saved-course.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SavedCourse.name, schema: SavedCourseSchema },
    ]),
  ],
  controllers: [StudentSavedCoursesController],
  providers: [StudentSavedCoursesService],
})
export class StudentSavedCoursesModule {}
