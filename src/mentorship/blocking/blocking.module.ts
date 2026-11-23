import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { MentorshipBlockingController } from './blocking.controller';
import { MentorshipBlockGuard } from './blocking.guard';
import { BlockingPolicy } from './blocking.policy';
import { MentorshipBlockingService } from './blocking.service';
import {
  MentorshipBlock,
  MentorshipBlockSchema,
} from './schemas/blocking.schema';

/**
 * MENTOR-044 — authoritative bidirectional block checks and management.
 * Reuses the canonical `mentorship_blocks` collection so every writer shares
 * the same unique compound index and the same idempotency guarantees.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorshipBlock.name, schema: MentorshipBlockSchema },
    ]),
    MetricsModule,
  ],
  controllers: [MentorshipBlockingController],
  providers: [
    MentorshipBlockingService,
    MentorshipBlockGuard,
    BlockingPolicy,
    MentorshipTelemetry,
  ],
  exports: [MentorshipBlockingService, MentorshipBlockGuard, BlockingPolicy],
})
export class MentorshipBlockingModule {}
