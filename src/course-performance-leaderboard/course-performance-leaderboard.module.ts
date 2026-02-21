import { Module } from '@nestjs/common';
import { CoursePerformanceLeaderboardController } from './course-performance-leaderboard.controller';
import { CoursePerformanceLeaderboardService } from './course-performance-leaderboard.service';

@Module({
  controllers: [CoursePerformanceLeaderboardController],
  providers: [CoursePerformanceLeaderboardService],
})
export class CoursePerformanceLeaderboardModule {}
