import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { AgreementAcceptanceController } from './agreement-acceptance.controller';
import { AgreementAcceptanceService } from './agreement-acceptance.service';
import {
  AgreementAcceptance,
  AgreementAcceptanceSchema,
  AgreementTerms,
  AgreementTermsSchema,
} from './schemas/agreement-acceptance.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgreementTerms.name, schema: AgreementTermsSchema },
      { name: AgreementAcceptance.name, schema: AgreementAcceptanceSchema },
    ]),
    MetricsModule,
  ],
  controllers: [AgreementAcceptanceController],
  providers: [AgreementAcceptanceService, MentorshipTelemetry],
  exports: [AgreementAcceptanceService],
})
export class AgreementAcceptanceModule {}
