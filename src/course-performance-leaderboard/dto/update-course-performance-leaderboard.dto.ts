import { PartialType } from '@nestjs/swagger';
import { CreateCoursePerformanceLeaderboardDto } from './create-course-performance-leaderboard.dto';

export class UpdateCoursePerformanceLeaderboardDto extends PartialType(
  CreateCoursePerformanceLeaderboardDto,
) {}
