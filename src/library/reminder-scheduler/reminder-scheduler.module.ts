import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import {
  ReminderDeliveryLog,
  ReminderDeliveryLogSchema,
} from './schemas/reminder-delivery-log.schema';
import { ReminderSchedulerService } from './reminder-scheduler.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: ReminderDeliveryLog.name,
        schema: ReminderDeliveryLogSchema,
      },
    ]),
  ],
  providers: [ReminderSchedulerService],
  exports: [ReminderSchedulerService],
})
export class ReminderSchedulerModule {}