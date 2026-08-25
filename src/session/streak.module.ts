import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StreakController } from './streak.controller';
import { StreakService } from './streak.service';
import {
  LearningStreak,
  LearningStreakSchema,
} from './schemas/learning-streak.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LearningStreak.name, schema: LearningStreakSchema },
    ]),
  ],
  controllers: [StreakController],
  providers: [StreakService],
  exports: [StreakService],
})
export class StreakModule {}
