import { Module } from '@nestjs/common';
import { StudentReportsAnalyticsController } from './student-reports-analytics.controller';
import { StudentReportsAnalyticsService } from './student-reports-analytics.service';

@Module({
  controllers: [StudentReportsAnalyticsController],
  providers: [StudentReportsAnalyticsService],
})
export class StudentReportsAnalyticsModule {}
