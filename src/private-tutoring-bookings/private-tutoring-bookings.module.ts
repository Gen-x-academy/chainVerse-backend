import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrivateTutoringBookingsController } from './private-tutoring-bookings.controller';
import { PrivateTutoringBookingsService } from './private-tutoring-bookings.service';
import {
  PrivateTutoringBooking,
  PrivateTutoringBookingSchema,
} from './schemas/private-tutoring-booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PrivateTutoringBooking.name,
        schema: PrivateTutoringBookingSchema,
      },
    ]),
  ],
  controllers: [PrivateTutoringBookingsController],
  providers: [PrivateTutoringBookingsService],
})
export class PrivateTutoringBookingsModule {}
