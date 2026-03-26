import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';
import { PointsRecord, PointsRecordSchema } from './schemas/points.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PointsRecord.name, schema: PointsRecordSchema },
    ]),
  ],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
