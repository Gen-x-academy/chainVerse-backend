import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipBlockingModule } from '../blocking/blocking.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { MentorshipSafetyCenterController } from './safety-center.controller';
import { MentorshipSafetyCenterService } from './safety-center.service';
import { SafetyCase, SafetyCaseSchema, SafetySettings, SafetySettingsSchema } from './schemas/safety.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SafetySettings.name, schema: SafetySettingsSchema },
      { name: SafetyCase.name, schema: SafetyCaseSchema },
    ]),
    MentorshipBlockingModule,
    MetricsModule,
  ],
  controllers: [MentorshipSafetyCenterController],
  providers: [MentorshipSafetyCenterService, MentorshipTelemetry],
  exports: [MentorshipSafetyCenterService],
})
export class MentorshipSafetyCenterModule {}
