import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { StreakService } from './streak.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Learning Streak')
@ApiBearerAuth('access-token')
@Controller('streaks')
@UseGuards(JwtAuthGuard)
export class StreakController {
  constructor(private readonly streakService: StreakService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current streak data for the authenticated user' })
  @ApiQuery({ name: 'timezone', required: false, example: 'America/New_York' })
  async getMyStreak(
    @Req() req: { user: { id: string } },
    @Query('timezone') timezone?: string,
  ) {
    return this.streakService.getStreak(req.user.id, timezone ?? 'UTC');
  }

  @Get('me/history')
  @ApiOperation({ summary: 'Get streak history for the authenticated user' })
  @ApiQuery({ name: 'timezone', required: false, example: 'America/New_York' })
  @ApiQuery({ name: 'limit', required: false, example: 30 })
  async getMyStreakHistory(
    @Req() req: { user: { id: string } },
    @Query('timezone') timezone?: string,
    @Query('limit') limit?: number,
  ) {
    return this.streakService.getStreakHistory(req.user.id, limit ?? 30);
  }
}
