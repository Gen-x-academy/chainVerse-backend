import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { AgreementController } from './agreement.controller';
import { AgreementPolicy } from './agreement.policy';
import { AgreementService } from './agreement.service';
import { Agreement, AgreementSchema } from './schemas/agreement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Agreement.name, schema: AgreementSchema }]),
    MetricsModule,
  ],
  controllers: [AgreementController],
  providers: [AgreementService, AgreementPolicy, MentorshipTelemetry],
  exports: [AgreementService],
})
export class AgreementModule {}
