import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
})
export class MentorshipModule {}
