import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CirculationMetricsService } from '../services/circulation-metrics.service';
import { CirculationMetricsQueryDto } from '../dto/circulation-metrics-query.dto';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Analytics')
@Controller('e-library/analytics/circulation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CirculationMetricsController {
  constructor(
    private readonly circulationMetricsService: CirculationMetricsService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({
    summary:
      'Get circulation metrics: checkouts, returns, renewals, overdue rate, hold fulfillment, utilization, and turnaround time',
  })
  getMetrics(@Query() query: CirculationMetricsQueryDto) {
    return this.circulationMetricsService.getCirculationMetrics(query);
  }
}
