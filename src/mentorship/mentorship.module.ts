import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { MetricsModule } from '../metrics/metrics.module';
import { MatchProposalService } from './match-proposal.service';
import { MentorshipAccessGuard } from './mentorship-access.guard';
import { MentorshipCapacityService } from './mentorship-capacity.service';
import { MentorshipCoordinatorController } from './mentorship-coordinator.controller';
import { MentorshipCoordinatorService } from './mentorship-coordinator.service';
import { MentorshipEligibilityService } from './mentorship-eligibility.service';
import { MentorshipProfileService } from './mentorship-profile.service';
import { MentorshipSweeper } from './mentorship-sweeper.service';
import { MentorshipTelemetry } from './mentorship-telemetry.service';
import { MentorshipController } from './mentorship.controller';
import {
  MatchProposal,
  MatchProposalSchema,
} from './schemas/match-proposal.schema';
import {
  MentorshipBlock,
  MentorshipBlockSchema,
} from './schemas/mentorship-block.schema';
import {
  MentorshipEngagement,
  MentorshipEngagementSchema,
} from './schemas/mentorship-engagement.schema';
import {
  MentorshipProfile,
  MentorshipProfileSchema,
} from './schemas/mentorship-profile.schema';

/**
 * Mentor matching: proposals (MENTOR-037), mutual acceptance (MENTOR-038)
 * and coordinator-assisted matching (MENTOR-039). See docs/mentorship/matching.md.
 *
 * Relies on the global AuditModule, EventEmitterModule and the
 * ScheduleModule registered by StellarModule.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MatchProposal.name, schema: MatchProposalSchema },
      { name: MentorshipEngagement.name, schema: MentorshipEngagementSchema },
      { name: MentorshipProfile.name, schema: MentorshipProfileSchema },
      { name: MentorshipBlock.name, schema: MentorshipBlockSchema },
    ]),
    IdempotencyModule,
    MetricsModule,
  ],
  controllers: [MentorshipController, MentorshipCoordinatorController],
  providers: [
    MatchProposalService,
    MentorshipCoordinatorService,
    MentorshipProfileService,
    MentorshipEligibilityService,
    MentorshipCapacityService,
    MentorshipTelemetry,
    MentorshipSweeper,
    MentorshipAccessGuard,
  ],
  exports: [MatchProposalService],
import { MentorAvailabilityModule } from './availability/availability.module';
import { MentorTrustController } from './trust/trust.controller';
import { MentorTrustService } from './trust/trust.service';
import {
  MentorTrustSignals,
  MentorTrustSignalsSchema,
} from './trust/trust-signals.schema';

@Module({
  imports: [
    MentorAvailabilityModule,
    MongooseModule.forFeature([
      { name: MentorTrustSignals.name, schema: MentorTrustSignalsSchema },
    ]),
  ],
  controllers: [MentorTrustController],
  providers: [MentorTrustService],
  exports: [MentorAvailabilityModule, MentorTrustService],
import { MentorProfileController } from './mentor-profile/mentor-profile.controller';
import { MentorProfileService } from './mentor-profile/mentor-profile.service';
import {
  MentorProfile,
  MentorProfileRevision,
  MentorProfileRevisionSchema,
  MentorProfileSchema,
} from './mentor-profile/schemas/mentor-profile.schema';

/** Mentorship domain. Starts with mentor professional profiles (MENTOR-008). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorProfile.name, schema: MentorProfileSchema },
      { name: MentorProfileRevision.name, schema: MentorProfileRevisionSchema },
    ]),
  ],
  controllers: [MentorProfileController],
  providers: [MentorProfileService],
  exports: [MentorProfileService],
})
export class MentorshipModule {}
