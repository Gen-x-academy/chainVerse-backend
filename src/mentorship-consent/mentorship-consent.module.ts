import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipConsentController } from './mentorship-consent.controller';
import { MentorshipConsentService } from './mentorship-consent.service';
import {
  MentorshipSessionConsent,
  MentorshipSessionConsentSchema,
} from './schemas/mentorship-session-consent.schema';
import {
  MentorshipDispute,
  MentorshipDisputeSchema,
} from './schemas/mentorship-dispute.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: MentorshipSessionConsent.name,
        schema: MentorshipSessionConsentSchema,
      },
      { name: MentorshipDispute.name, schema: MentorshipDisputeSchema },
    ]),
  ],
  controllers: [MentorshipConsentController],
  providers: [MentorshipConsentService],
  exports: [MentorshipConsentService],
})
export class MentorshipConsentModule {}
