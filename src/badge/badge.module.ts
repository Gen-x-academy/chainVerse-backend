import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BadgeController } from './badge.controller';
import { BadgeService } from './badge.service';
import { Badge, BadgeSchema } from './schemas/badge.schema';
import { BadgeAward, BadgeAwardSchema } from './schemas/badge-award.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Badge.name, schema: BadgeSchema },
      { name: BadgeAward.name, schema: BadgeAwardSchema },
    ]),
  ],
  controllers: [BadgeController],
  providers: [BadgeService],
  exports: [BadgeService],
})
export class BadgeModule {}
