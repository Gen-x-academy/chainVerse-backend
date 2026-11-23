import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { AgePolicyService } from './age-policy.service';
import { GuardianConsentController } from './guardian-consent.controller';
import { GuardianConsentPolicy } from './guardian-consent.policy';
import { GuardianConsentService } from './guardian-consent.service';
import {
  GuardianConsentRecord,
  GuardianConsentRecordSchema,
} from './schemas/guardian-consent.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GuardianConsentRecord.name, schema: GuardianConsentRecordSchema },
    ]),
    MetricsModule,
  ],
  controllers: [GuardianConsentController],
  providers: [
    GuardianConsentService,
    AgePolicyService,
    GuardianConsentPolicy,
    MentorshipTelemetry,
  ],
  exports: [GuardianConsentService],
})
export class GuardianConsentModule {}
