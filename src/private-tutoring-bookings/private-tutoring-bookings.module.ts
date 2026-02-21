import { Module } from '@nestjs/common';
import { PrivateTutoringBookingsController } from './private-tutoring-bookings.controller';
import { PrivateTutoringBookingsService } from './private-tutoring-bookings.service';

@Module({
  controllers: [PrivateTutoringBookingsController],
  providers: [PrivateTutoringBookingsService],
})
export class PrivateTutoringBookingsModule {}
