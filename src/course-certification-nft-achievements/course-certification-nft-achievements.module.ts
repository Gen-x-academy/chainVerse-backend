import { Module } from '@nestjs/common';
import { CourseCertificationNftAchievementsController } from './course-certification-nft-achievements.controller';
import { CourseCertificationNftAchievementsService } from './course-certification-nft-achievements.service';

@Module({
  controllers: [CourseCertificationNftAchievementsController],
  providers: [CourseCertificationNftAchievementsService],
})
export class CourseCertificationNftAchievementsModule {}
