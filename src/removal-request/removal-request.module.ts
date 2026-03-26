import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RemovalRequestController } from './removal-request.controller';
import { RemovalRequestService } from './removal-request.service';
import {
  RemovalRequest,
  RemovalRequestSchema,
} from './schemas/removal-request.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RemovalRequest.name, schema: RemovalRequestSchema },
    ]),
  ],
  controllers: [RemovalRequestController],
  providers: [RemovalRequestService],
  exports: [RemovalRequestService],
})
export class RemovalRequestModule {}
