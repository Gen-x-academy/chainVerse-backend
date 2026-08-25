import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportAbuseController } from './report-abuse.controller';
import { ReportAbuseService } from './report-abuse.service';
import { AbuseReport, AbuseReportSchema } from './schemas/report-abuse.schema';
import { PaginationModule } from '../common/pagination/pagination.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AbuseReport.name, schema: AbuseReportSchema },
    ]),
    PaginationModule,
  ],
  controllers: [ReportAbuseController],
  providers: [ReportAbuseService],
})
export class ReportAbuseModule {}
