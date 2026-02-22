import { Module } from '@nestjs/common';
import { GamificationPointsController } from './gamification-points.controller';
import { GamificationPointsService } from './gamification-points.service';

@Module({
  controllers: [GamificationPointsController],
  providers: [GamificationPointsService],
})
export class GamificationPointsModule {}
