import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { CapacityAccessPolicy } from './capacity-access.policy';
import { CapacityController } from './capacity.controller';
import { CapacityService } from './capacity.service';
import {
  CapacityAllocation,
  CapacityAllocationSchema,
} from './schemas/capacity-allocation.schema';
import {
  CapacityPolicy,
  CapacityPolicySchema,
} from './schemas/capacity-policy.schema';
import {
  CapacityReservation,
  CapacityReservationSchema,
} from './schemas/capacity-reservation.schema';

/**
 * MENTOR-041 capacity allocation. Standalone so it can be registered once in
 * AppModule without changing the existing MentorshipCapacityService used by
 * the proposal flow.
 */
@Module({
  imports: [
    MetricsModule,
    MongooseModule.forFeature([
      { name: CapacityPolicy.name, schema: CapacityPolicySchema },
      { name: CapacityAllocation.name, schema: CapacityAllocationSchema },
      { name: CapacityReservation.name, schema: CapacityReservationSchema },
    ]),
  ],
  controllers: [CapacityController],
  providers: [CapacityService, CapacityAccessPolicy, MentorshipTelemetry],
  exports: [CapacityService, CapacityAccessPolicy],
})
export class CapacityModule {}
