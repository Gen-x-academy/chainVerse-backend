import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipSponsorshipController } from './mentorship-sponsorship.controller';
import { MentorshipSponsorshipService } from './mentorship-sponsorship.service';
import {
  MentorshipSponsorship,
  MentorshipSponsorshipSchema,
  SponsorshipReservation,
  SponsorshipReservationSchema,
} from './schemas/sponsorship.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorshipSponsorship.name, schema: MentorshipSponsorshipSchema },
      {
        name: SponsorshipReservation.name,
        schema: SponsorshipReservationSchema,
      },
    ]),
  ],
  controllers: [MentorshipSponsorshipController],
  providers: [MentorshipSponsorshipService],
  exports: [MentorshipSponsorshipService],
})
export class MentorshipSponsorshipModule {}
