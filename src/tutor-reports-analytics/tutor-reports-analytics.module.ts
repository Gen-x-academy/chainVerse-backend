import { Module } from '@nestjs/common';
import { TutorReportsAnalyticsController } from './tutor-reports-analytics.controller';
import { TutorReportsAnalyticsService } from './tutor-reports-analytics.service';

@Module({
  controllers: [TutorReportsAnalyticsController],
  providers: [TutorReportsAnalyticsService],
})
export class TutorReportsAnalyticsModule {}
