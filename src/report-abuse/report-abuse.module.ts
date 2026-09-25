import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportAbuseController } from './report-abuse.controller';
import { ReportAbuseService } from './report-abuse.service';
import { AbuseReport, AbuseReportSchema } from './schemas/report-abuse.schema';
import { Sanction, SanctionSchema } from './schemas/sanction.schema';
import { SanctionService } from './sanction.service';
import { SanctionController } from './sanction.controller';
import { PaginationModule } from '../common/pagination/pagination.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AbuseReport.name, schema: AbuseReportSchema },
      { name: Sanction.name, schema: SanctionSchema },
    ]),
    PaginationModule,
  ],
  controllers: [ReportAbuseController, SanctionController],
  providers: [ReportAbuseService, SanctionService],
})
export class ReportAbuseModule {}
