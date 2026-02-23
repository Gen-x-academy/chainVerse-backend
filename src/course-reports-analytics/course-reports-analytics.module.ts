import { Module } from '@nestjs/common';
import { CourseReportsAnalyticsController } from './course-reports-analytics.controller';
import { CourseReportsAnalyticsService } from './course-reports-analytics.service';

@Module({
  controllers: [CourseReportsAnalyticsController],
  providers: [CourseReportsAnalyticsService],
})
export class CourseReportsAnalyticsModule {}
