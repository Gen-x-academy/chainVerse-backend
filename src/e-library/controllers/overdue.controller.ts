import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { OverdueSchedulerService } from '../services/overdue-scheduler.service';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Overdue Scheduler')
@Controller('e-library/overdue')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OverdueController {
  constructor(
    private readonly overdueSchedulerService: OverdueSchedulerService,
  ) {}

  @Post('run')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Manually trigger the overdue-transition reconciliation job (operational use, e.g. after downtime)',
  })
  run() {
    return this.overdueSchedulerService.runJob('overdue-manual-trigger');
  }

  @Get('runs')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'View recent scheduler job run history for observability',
  })
  runs(@Query('jobName') jobName?: string, @Query('limit') limit?: string) {
    return this.overdueSchedulerService.getRecentRuns(
      jobName,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
