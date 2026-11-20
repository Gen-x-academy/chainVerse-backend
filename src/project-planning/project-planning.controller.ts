import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
  AddMitigationDto,
  AddProjectMemberDto,
  CreateObjectiveDto,
  CreatePhaseDto,
  CreateProjectDto,
  CreateRiskDto,
  DecideExtensionDto,
  RecordCheckInDto,
  RequestExtensionDto,
} from './dto/project-planning.dto';
import { ProjectPlanningService } from './project-planning.service';
import { PlanningActor } from './project-planning.types';

@ApiTags('Project Planning')
@ApiBearerAuth('access-token')
@ApiParam({ name: 'tenantId', description: 'Tenant owning the project data' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT, Role.LIBRARIAN)
@Controller('planning/tenants/:tenantId')
export class ProjectPlanningController {
  constructor(private readonly service: ProjectPlanningService) {}

  @Post('projects')
  @ApiOperation({ summary: 'Create a tenant-scoped project (issue #1573)' })
  @ApiResponse({
    status: 201,
    description: 'Project created; creator becomes owner',
  })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  createProject(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: CreateProjectDto,
  ) {
    return this.service.createProject(
      this.actor(tenantId, user),
      tenantId,
      dto,
    );
  }

  @Get('projects')
  @ApiOperation({ summary: 'List projects visible to the caller' })
  listProjects(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listProjects(this.actor(tenantId, user), tenantId);
  }

  @Post('projects/:projectId/members')
  @ApiOperation({ summary: 'Grant a project role to a user' })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  addMember(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: AddProjectMemberDto,
  ) {
    return this.service.addProjectMember(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      dto,
    );
  }

  @Post('projects/:projectId/objectives')
  @ApiOperation({ summary: 'Create a progress objective (issue #1571)' })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  createObjective(
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
  @ApiOperation({ summary: 'List objectives with current progress' })
  listObjectives(
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

  @Post('objectives/:objectiveId/check-ins')
  @ApiOperation({
    summary: 'Record an objective progress check-in (issue #1571)',
  })
  @ApiParam({ name: 'objectiveId', description: 'Objective identifier' })
  @ApiResponse({ status: 422, description: 'BIZ_INVALID_STATE_TRANSITION' })
  recordCheckIn(
    @Param('tenantId') tenantId: string,
    @Param('objectiveId') objectiveId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: RecordCheckInDto,
  ) {
    return this.service.recordCheckIn(
      this.actor(tenantId, user),
      tenantId,
      objectiveId,
      dto,
    );
  }

  @Get('objectives/:objectiveId/check-ins')
  @ApiOperation({ summary: 'List redacted check-in metadata' })
  @ApiParam({ name: 'objectiveId', description: 'Objective identifier' })
  listCheckIns(
    @Param('tenantId') tenantId: string,
    @Param('objectiveId') objectiveId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listCheckIns(
      this.actor(tenantId, user),
      tenantId,
      objectiveId,
    );
  }

  @Post('projects/:projectId/risks')
  @ApiOperation({ summary: 'Register a assessed project risk (issue #1572)' })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  createRisk(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: CreateRiskDto,
  ) {
    return this.service.createRisk(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      dto,
    );
  }

  @Get('projects/:projectId/risks')
  @ApiOperation({ summary: 'List risks with mitigation metadata' })
  listRisks(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listRisks(
      this.actor(tenantId, user),
      tenantId,
      projectId,
    );
  }

  @Post('risks/:riskId/mitigations')
  @ApiOperation({ summary: 'Add an owned mitigation to a risk (issue #1572)' })
  @ApiParam({ name: 'riskId', description: 'Risk identifier' })
  addMitigation(
    @Param('tenantId') tenantId: string,
    @Param('riskId') riskId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: AddMitigationDto,
  ) {
    return this.service.addMitigation(
      this.actor(tenantId, user),
      tenantId,
      riskId,
      dto,
    );
  }

  @Post('projects/:projectId/phases')
  @ApiOperation({
    summary: 'Append a date-ordered roadmap phase (issue #1573)',
  })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  @ApiResponse({ status: 422, description: 'BIZ_INVALID_STATE_TRANSITION' })
  addPhase(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: CreatePhaseDto,
  ) {
    return this.service.addPhase(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      dto,
    );
  }

  @Get('projects/:projectId/roadmap')
  @ApiOperation({ summary: 'List the ordered project roadmap' })
  listRoadmap(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listRoadmap(
      this.actor(tenantId, user),
      tenantId,
      projectId,
    );
  }

  @Post('projects/:projectId/extension-requests')
  @ApiOperation({
    summary: 'Request a bounded deadline extension (issue #1574)',
  })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  requestExtension(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: RequestExtensionDto,
  ) {
    return this.service.requestExtension(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      dto,
    );
  }

  @Get('projects/:projectId/extension-requests')
  @ApiOperation({ summary: 'List redacted deadline extension requests' })
  listExtensionRequests(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listExtensionRequests(
      this.actor(tenantId, user),
      tenantId,
      projectId,
    );
  }

  @Post('extension-requests/:requestId/decision')
  @ApiOperation({
    summary:
      'Approve or reject an extension without self-approval (issue #1574)',
  })
  @ApiParam({ name: 'requestId', description: 'Extension request identifier' })
  @ApiResponse({ status: 403, description: 'BIZ_SEPARATION_OF_DUTIES' })
  decideExtension(
    @Param('tenantId') tenantId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: DecideExtensionDto,
  ) {
    return this.service.decideExtension(
      this.actor(tenantId, user),
      tenantId,
      requestId,
      dto,
    );
  }

  private actor(
    tenantId: string,
    user: Record<string, unknown> | undefined,
  ): PlanningActor | undefined {
    if (!user) {
      return undefined;
    }
    return {
      actorId: typeof user['sub'] === 'string' ? user['sub'] : '',
      tenantId,
      roles: typeof user['role'] === 'string' ? [user['role']] : [],
    };
  }
}
