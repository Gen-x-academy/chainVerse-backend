import { Module } from '@nestjs/common';
import { StudentSavedCoursesController } from './student-saved-courses.controller';
import { StudentSavedCoursesService } from './student-saved-courses.service';

@Module({
  controllers: [StudentSavedCoursesController],
  providers: [StudentSavedCoursesService],
})
export class StudentSavedCoursesModule {}
