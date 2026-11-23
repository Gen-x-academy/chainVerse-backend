import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule } from '../../metrics/metrics.module';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { RematchController } from './rematch.controller';
import { RematchService } from './rematch.service';
import {
  RematchEvent,
  RematchEventSchema,
  RematchRequest,
  RematchRequestSchema,
} from './schemas/rematch-request.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RematchRequest.name, schema: RematchRequestSchema },
      { name: RematchEvent.name, schema: RematchEventSchema },
    ]),
    MetricsModule,
  ],
  controllers: [RematchController],
  providers: [RematchService, MentorshipTelemetry],
  exports: [RematchService],
})
export class RematchModule {}
