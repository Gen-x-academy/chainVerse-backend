import { Module } from '@nestjs/common';
import { RemovalRequestController } from './removal-request.controller';
import { RemovalRequestService } from './removal-request.service';

@Module({
  controllers: [RemovalRequestController],
  providers: [RemovalRequestService],
  exports: [RemovalRequestService],
})
export class RemovalRequestModule {}
