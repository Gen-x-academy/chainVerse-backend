import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { MentorshipRefundController } from './mentorship-refund.controller';
import { MentorshipRefundService } from './mentorship-refund.service';
import {
  RefundCalculation,
  RefundCalculationSchema,
} from './schemas/refund-calculation.schema';

/**
 * MENTOR-083. Provide `MENTORSHIP_REFUND_TRANSFER` (a `RefundTransferPort`)
 * from the payments integration; without it transfers return 409.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RefundCalculation.name, schema: RefundCalculationSchema },
    ]),
    MetricsModule,
  ],
  controllers: [MentorshipRefundController],
  providers: [MentorshipRefundService, MentorshipTelemetry],
  exports: [MentorshipRefundService],
})
export class MentorshipRefundModule {}
