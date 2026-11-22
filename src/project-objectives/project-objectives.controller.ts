import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateObjectiveDto,
  RecordProgressDto,
  RegisterObjectivesProjectDto,
  TransitionObjectiveDto,
  UpdateObjectiveDto,
} from './dto/project-objectives.dto';
import { ProjectObjectivesService } from './project-objectives.service';
import { ObjectivesActor } from './project-objectives.types';

@ApiTags('Project Objectives')
@ApiBearerAuth('access-token')
@ApiParam({
  name: 'tenantId',
  description: 'Tenant that owns the project data',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT)
@Controller('objectives/tenants/:tenantId')
export class ProjectObjectivesController {
  constructor(private readonly service: ProjectObjectivesService) {}

  @Post('projects')
  @ApiOperation({
    summary: 'Register a project membership stub for objectives (CAPSTONE-057)',
    description:
      'Platform admins/moderators create it; afterwards project owners/planners (or admins) may replace it.',
  })
  @ApiResponse({ status: 201, description: 'Project registered' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  registerProject(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() body: RegisterObjectivesProjectDto,
  ) {
    this.service.registerProject(this.actor(tenantId, user), tenantId, {
      id: body.projectId,
      tenantId,
      members: body.members ?? {},
    });
    return { projectId: body.projectId, tenantId };
  }

  @Post('projects/:projectId/objectives')
  @ApiOperation({
    summary: 'Create a draft objective with success criteria (CAPSTONE-057)',
    description:
      'Project owners/planners and platform admins. The owner must be a project member; the target must move away from ' +
      'the baseline in the stated direction; criterion thresholds must lie between baseline and target.',
  })
  @ApiParam({ name: 'projectId' })
  @ApiResponse({ status: 201, description: 'Objective created in draft' })
  @ApiResponse({
    status: 400,
    description:
      'VAL_INVALID_INPUT | VAL_OBJECTIVE_TARGET_INVALID | VAL_OBJECTIVE_DATES_INVALID',
  })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 409, description: 'BIZ_IDEMPOTENCY_KEY_REUSED' })
  @ApiResponse({ status: 422, description: 'BIZ_OBJECTIVE_OWNER_NOT_MEMBER' })
  create(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: CreateObjectiveDto,
  ) {
    return this.service.createObjective(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      dto,
    );
  }

  @Get('projects/:projectId/objectives')
  @ApiOperation({
    summary: 'List visible objectives, highest priority first (CAPSTONE-057)',
    description:
      'Members see private/team/public objectives they are entitled to; non-members see only public objectives, in a minimal view.',
  })
  @ApiParam({ name: 'projectId' })
  @ApiResponse({ status: 404, description: 'RES_NOT_FOUND' })
  list(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listObjectives(
      this.actor(tenantId, user),
      tenantId,
      projectId,
    );
  }

  @Get('objectives/:objectiveId')
  @ApiOperation({ summary: 'Get one objective (visibility applies)' })
  @ApiParam({ name: 'objectiveId' })
  @ApiResponse({ status: 404, description: 'RES_OBJECTIVE_NOT_FOUND' })
  get(
    @Param('tenantId') tenantId: string,
    @Param('objectiveId') objectiveId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getObjective(
      this.actor(tenantId, user),
      tenantId,
      objectiveId,
    );
  }

  @Patch('objectives/:objectiveId')
  @ApiOperation({
    summary: 'Replace a draft objective definition (CAPSTONE-057)',
    description: 'Requires expectedVersion; a stale version returns 409.',
  })
  @ApiParam({ name: 'objectiveId' })
  @ApiResponse({
    status: 409,
    description: 'BIZ_OBJECTIVE_STALE_VERSION | BIZ_IDEMPOTENCY_KEY_REUSED',
  })
  @ApiResponse({
    status: 422,
    description: 'BIZ_OBJECTIVE_NOT_EDITABLE | BIZ_OBJECTIVE_OWNER_NOT_MEMBER',
  })
  update(
    @Param('tenantId') tenantId: string,
    @Param('objectiveId') objectiveId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: UpdateObjectiveDto,
  ) {
    return this.service.updateObjective(
      this.actor(tenantId, user),
      tenantId,
      objectiveId,
      dto,
    );
  }

  @Post('objectives/:objectiveId/transitions')
  @ApiOperation({
    summary: 'Move an objective through its lifecycle (CAPSTONE-057)',
    description:
      'draft → active | abandoned; active → achieved | abandoned. Activation needs a charter reference and ≥1 criterion; ' +
      'achievement needs every required criterion met.',
  })
  @ApiParam({ name: 'objectiveId' })
  @ApiResponse({ status: 409, description: 'BIZ_OBJECTIVE_STALE_VERSION' })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_OBJECTIVE_INVALID_TRANSITION | BIZ_OBJECTIVE_CHARTER_REQUIRED | BIZ_OBJECTIVE_CRITERIA_REQUIRED | BIZ_OBJECTIVE_CRITERIA_UNMET',
  })
  transition(
    @Param('tenantId') tenantId: string,
    @Param('objectiveId') objectiveId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: TransitionObjectiveDto,
  ) {
    return this.service.transitionObjective(
      this.actor(tenantId, user),
      tenantId,
      objectiveId,
      dto,
    );
  }

  @Post('objectives/:objectiveId/progress')
  @ApiOperation({
    summary: 'Record the current metric value on an active objective',
    description:
      'The objective owner, project owners/planners and platform admins.',
  })
  @ApiParam({ name: 'objectiveId' })
  @ApiResponse({ status: 422, description: 'BIZ_OBJECTIVE_NOT_EDITABLE' })
  progress(
    @Param('tenantId') tenantId: string,
    @Param('objectiveId') objectiveId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: RecordProgressDto,
  ) {
    return this.service.recordProgress(
      this.actor(tenantId, user),
      tenantId,
      objectiveId,
      dto,
    );
  }

  @Get('audit')
  @ApiOperation({ summary: 'Read objectives audit metadata (admin/moderator)' })
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
  ): ObjectivesActor | undefined {
    if (!user) return undefined;
    return {
      actorId: typeof user['sub'] === 'string' ? user['sub'] : '',
      tenantId,
      roles: typeof user['role'] === 'string' ? [user['role']] : [],
    };
  }
}
