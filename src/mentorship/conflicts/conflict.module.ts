import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { ConflictAccessPolicy } from './conflict-access.policy';
import { ConflictController } from './conflict.controller';
import { ConflictService } from './conflict.service';
import {
  ConflictCheck,
  ConflictCheckSchema,
} from './schemas/conflict-check.schema';
import {
  ConflictWaiver,
  ConflictWaiverSchema,
} from './schemas/conflict-waiver.schema';

/** MENTOR-040 conflict-of-interest checks and waiver workflow. */
@Module({
  imports: [
    MetricsModule,
    MongooseModule.forFeature([
      { name: ConflictCheck.name, schema: ConflictCheckSchema },
      { name: ConflictWaiver.name, schema: ConflictWaiverSchema },
    ]),
  ],
  controllers: [ConflictController],
  providers: [ConflictService, ConflictAccessPolicy, MentorshipTelemetry],
  exports: [ConflictService, ConflictAccessPolicy],
})
export class ConflictModule {}
