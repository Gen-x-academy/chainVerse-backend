import { Module } from '@nestjs/common';
import { CourseCategorizationFilteringController } from './course-categorization-filtering.controller';
import { CourseCategorizationFilteringService } from './course-categorization-filtering.service';

@Module({
  controllers: [CourseCategorizationFilteringController],
  providers: [CourseCategorizationFilteringService],
})
export class CourseCategorizationFilteringModule {}
