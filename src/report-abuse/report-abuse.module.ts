import { Module } from '@nestjs/common';
import { ReportAbuseController } from './report-abuse.controller';
import { ReportAbuseService } from './report-abuse.service';

@Module({
  controllers: [ReportAbuseController],
  providers: [ReportAbuseService],
})
export class ReportAbuseModule {}
