import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateTaskDto,
  RegisterScheduleProjectDto,
  TakeSnapshotDto,
  TransitionTaskDto,
  UpdateTaskDto,
} from './dto/project-schedule-risk.dto';
import { ProjectScheduleRiskService } from './project-schedule-risk.service';
import { ScheduleActor } from './project-schedule-risk.types';

@ApiTags('Project Schedule Risk')
@ApiBearerAuth('access-token')
@ApiParam({
  name: 'tenantId',
  description: 'Tenant that owns the project data',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT)
@Controller('schedule-risk/tenants/:tenantId')
export class ProjectScheduleRiskController {
  constructor(private readonly service: ProjectScheduleRiskService) {}

  @Post('projects')
  @ApiOperation({
    summary: 'Register a project membership stub and deadline (CAPSTONE-059)',
    description:
      'Platform admins/moderators create it; afterwards project owners/planners (or admins) may replace it.',
  })
  @ApiResponse({ status: 201, description: 'Project registered' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  registerProject(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() body: RegisterScheduleProjectDto,
  ) {
    this.service.registerProject(this.actor(tenantId, user), tenantId, {
      id: body.projectId,
      members: body.members ?? {},
      deadline: body.deadline ?? null,
    });
    return { projectId: body.projectId, tenantId };
  }

  @Post('projects/:projectId/tasks')
  @ApiOperation({
    summary: 'Create a task with finish-to-start dependencies (CAPSTONE-059)',
    description:
      'Project owners/planners and platform admins. Dependencies must exist in the project.',
  })
  @ApiParam({ name: 'projectId' })
  @ApiResponse({ status: 201, description: 'Task created as planned' })
  @ApiResponse({
    status: 400,
    description: 'VAL_INVALID_INPUT | VAL_SCHEDULE_DATES_INVALID',
  })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 409, description: 'BIZ_IDEMPOTENCY_KEY_REUSED' })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_SCHEDULE_DEPENDENCY_UNKNOWN | BIZ_SCHEDULE_LIMIT_EXCEEDED',
  })
  createTask(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: CreateTaskDto,
  ) {
    return this.service.createTask(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      dto,
    );
  }

  @Get('projects/:projectId/tasks')
  @ApiOperation({ summary: 'List tasks in start-date order (CAPSTONE-059)' })
  @ApiParam({ name: 'projectId' })
  @ApiResponse({
    status: 404,
    description: 'RES_NOT_FOUND (also for non-members)',
  })
  listTasks(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listTasks(
      this.actor(tenantId, user),
      tenantId,
      projectId,
    );
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Get one task (CAPSTONE-059)' })
  @ApiParam({ name: 'taskId' })
  @ApiResponse({
    status: 404,
    description: 'RES_SCHEDULE_TASK_NOT_FOUND | RES_NOT_FOUND',
  })
  getTask(
    @Param('tenantId') tenantId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getTask(this.actor(tenantId, user), tenantId, taskId);
  }

  @Patch('tasks/:taskId')
  @ApiOperation({
    summary: 'Edit a task; rejects dependency cycles (CAPSTONE-059)',
    description:
      'Requires the current `expectedVersion`. A dependency that would make the task reachable from itself returns 422 with the cycle path.',
  })
  @ApiParam({ name: 'taskId' })
  @ApiResponse({ status: 200, description: 'Task updated' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({
    status: 409,
    description: 'BIZ_SCHEDULE_STALE_VERSION | BIZ_IDEMPOTENCY_KEY_REUSED',
  })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_SCHEDULE_DEPENDENCY_CYCLE | BIZ_SCHEDULE_DEPENDENCY_UNKNOWN | BIZ_SCHEDULE_TASK_CLOSED',
  })
  updateTask(
    @Param('tenantId') tenantId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.service.updateTask(
      this.actor(tenantId, user),
      tenantId,
      taskId,
      dto,
    );
  }

  @Post('tasks/:taskId/transitions')
  @ApiOperation({ summary: 'Move a task through its lifecycle (CAPSTONE-059)' })
  @ApiParam({ name: 'taskId' })
  @ApiResponse({ status: 201, description: 'Task transitioned' })
  @ApiResponse({
    status: 409,
    description: 'BIZ_SCHEDULE_STALE_VERSION | BIZ_IDEMPOTENCY_KEY_REUSED',
  })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_SCHEDULE_INVALID_TRANSITION | BIZ_SCHEDULE_PREDECESSORS_OPEN',
  })
  transition(
    @Param('tenantId') tenantId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: TransitionTaskDto,
  ) {
    return this.service.transitionTask(
      this.actor(tenantId, user),
      tenantId,
      taskId,
      dto,
    );
  }

  @Get('projects/:projectId/analysis')
  @ApiOperation({
    summary:
      'Critical path, impossible dates, resource conflicts and deadline risk (CAPSTONE-059)',
    description:
      'Computed on demand; read-only. Findings reference task ids only. Assignee ids appear only for owners/planners/admins.',
  })
  @ApiParam({ name: 'projectId' })
  @ApiQuery({
    name: 'asOf',
    required: false,
    description: 'YYYY-MM-DD; defaults to today (UTC)',
  })
  @ApiResponse({ status: 400, description: 'VAL_SCHEDULE_DATES_INVALID' })
  @ApiResponse({ status: 404, description: 'RES_NOT_FOUND' })
  analyze(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Query('asOf') asOf?: string,
  ) {
    return this.service.analyze(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      asOf,
    );
  }

  @Post('projects/:projectId/analysis/snapshots')
  @ApiOperation({
    summary:
      'Record an analysis snapshot and notify new high/critical findings once (CAPSTONE-059)',
    description:
      'Owners/planners and admins. Each finding is notified at most once per project; failed notifications are retried by a later snapshot.',
  })
  @ApiParam({ name: 'projectId' })
  @ApiResponse({ status: 201, description: 'Snapshot recorded' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 409, description: 'BIZ_IDEMPOTENCY_KEY_REUSED' })
  takeSnapshot(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: TakeSnapshotDto,
  ) {
    return this.service.takeSnapshot(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      dto,
    );
  }

  @Get('projects/:projectId/analysis/snapshots')
  @ApiOperation({
    summary: 'List recorded snapshots, oldest first (CAPSTONE-059)',
  })
  @ApiParam({ name: 'projectId' })
  listSnapshots(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listSnapshots(
      this.actor(tenantId, user),
      tenantId,
      projectId,
    );
  }

  @Get('audit')
  @ApiOperation({ summary: 'Read schedule audit metadata (admin/moderator)' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  audit(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getAudit(this.actor(tenantId, user), tenantId);
  }

  private actor(
    tenantId: string,
    user: Record<string, unknown> | undefined,
  ): ScheduleActor | undefined {
    if (!user) return undefined;
    return {
      actorId: typeof user['sub'] === 'string' ? user['sub'] : '',
      tenantId,
      roles: typeof user['role'] === 'string' ? [user['role']] : [],
    };
  }
}
