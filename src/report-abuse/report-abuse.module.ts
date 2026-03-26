import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportAbuseController } from './report-abuse.controller';
import { ReportAbuseService } from './report-abuse.service';
import { AbuseReport, AbuseReportSchema } from './schemas/report-abuse.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AbuseReport.name, schema: AbuseReportSchema },
    ]),
  ],
  controllers: [ReportAbuseController],
  providers: [ReportAbuseService],
})
export class ReportAbuseModule {}
