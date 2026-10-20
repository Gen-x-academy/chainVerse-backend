import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../../common/enums/role.enum';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Idempotent } from '../../../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../../../idempotency/idempotency.interceptor';
import { Actor, MentorshipAccessGuard } from '../../mentorship-access.guard';
import type { MentorshipActor } from '../../mentorship.policy';
import {
  AlertQueryDto,
  MentorDashboardQueryDto,
  MentorEarningsQueryDto,
  MentorSessionsQueryDto,
} from '../dto/mentorship-operations-query.dto';
import { ReadAlertsDto } from '../dto/read-alerts.dto';
import { MentorDashboardService } from '../services/mentor-dashboard.service';

@ApiTags('Mentor Dashboard')
@ApiBearerAuth('access-token')
@UseGuards(MentorshipAccessGuard)
@UseInterceptors(IdempotencyInterceptor)
@Roles(Role.TUTOR, Role.ADMIN)
@Controller('mentorship/mentor')
export class MentorDashboardController {
  constructor(private readonly mentor: MentorDashboardService) {}

  @ApiOperation({ summary: 'Mentor operations dashboard (MENTOR-115)' })
  @ApiResponse({ status: 200, description: 'Dashboard payload scoped to the caller' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Get()
  dashboard(
    @Actor() actor: MentorshipActor,
    @Query() query: MentorDashboardQueryDto,
  ) {
    return this.mentor.dashboard(actor, query);
  }

  @ApiOperation({ summary: 'Paginated mentor sessions' })
  @Get('sessions')
  sessions(
    @Actor() actor: MentorshipActor,
    @Query() query: MentorSessionsQueryDto,
  ) {
    return this.mentor.sessions(actor, query);
  }

  @ApiOperation({ summary: 'Paginated mentor task list' })
  @Get('tasks')
  tasks(
    @Actor() actor: MentorshipActor,
    @Query() query: MentorSessionsQueryDto,
  ) {
    return this.mentor.tasks(actor, query);
  }

  @ApiOperation({ summary: 'Earnings summary and session fee lines' })
  @Get('earnings')
  earnings(
    @Actor() actor: MentorshipActor,
    @Query() query: MentorEarningsQueryDto,
  ) {
    return this.mentor.earnings(actor, query);
  }

  @ApiOperation({ summary: 'Mentor alerts' })
  @Get('alerts')
  alerts(@Actor() actor: MentorshipActor, @Query() query: AlertQueryDto) {
    return this.mentor.alerts(actor, query);
  }

  @ApiOperation({ summary: 'Mark alerts as read (idempotent)' })
  @ApiResponse({ status: 404, description: 'RES_NOT_FOUND' })
  @Idempotent()
  @Post('alerts/read')
  readAlerts(@Actor() actor: MentorshipActor, @Body() dto: ReadAlertsDto) {
    return this.mentor.markAlertsRead(actor, dto);
  }
}
