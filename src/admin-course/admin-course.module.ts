import { Module } from '@nestjs/common';
import { AdminCourseController } from './admin-course.controller';
import { AdminCourseService } from './admin-course.service';

@Module({
  controllers: [AdminCourseController],
  providers: [AdminCourseService],
  exports: [AdminCourseService],
})
export class AdminCourseModule {}
