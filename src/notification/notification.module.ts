import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { PaginationModule } from '../common/pagination/pagination.module';
import { NotificationControllerV2 } from './notification.controller.v2';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
    PaginationModule,
  ],
  controllers: [NotificationController, NotificationControllerV2],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
