import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { AgreementAmendmentController } from './agreement-amendment.controller';
import { AgreementAmendmentService } from './agreement-amendment.service';
import {
  AgreementAmendment,
  AgreementAmendmentSchema,
} from './schemas/agreement-amendment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgreementAmendment.name, schema: AgreementAmendmentSchema },
    ]),
    MetricsModule,
  ],
  controllers: [AgreementAmendmentController],
  providers: [AgreementAmendmentService, MentorshipTelemetry],
  exports: [AgreementAmendmentService],
})
export class AgreementAmendmentModule {}
