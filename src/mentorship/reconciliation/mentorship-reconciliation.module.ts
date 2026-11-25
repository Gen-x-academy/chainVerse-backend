import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { MentorshipReconciliationController } from './mentorship-reconciliation.controller';
import { MentorshipReconciliationService } from './mentorship-reconciliation.service';
import {
  ReconciliationMismatch,
  ReconciliationMismatchSchema,
  ReconciliationRun,
  ReconciliationRunSchema,
} from './schemas/reconciliation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReconciliationRun.name, schema: ReconciliationRunSchema },
      { name: ReconciliationMismatch.name, schema: ReconciliationMismatchSchema },
    ]),
    MetricsModule,
  ],
  controllers: [MentorshipReconciliationController],
  providers: [MentorshipReconciliationService, MentorshipTelemetry],
  exports: [MentorshipReconciliationService],
})
export class MentorshipReconciliationModule {}
