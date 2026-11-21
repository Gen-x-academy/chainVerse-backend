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
  AssignReviewerDto,
  CreateMilestoneDto,
  RegisterProjectDto,
  TransitionMilestoneDto,
  UpdateMilestoneDto,
} from './dto/project-milestones.dto';
import { ProjectMilestonesService } from './project-milestones.service';
import {
  MilestoneProjectRole,
  MilestoneProjectStub,
  MilestonesActor,
} from './project-milestones.types';

@ApiTags('Project Milestones')
@ApiBearerAuth('access-token')
@ApiParam({ name: 'tenantId', description: 'Tenant that owns the project data' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT, Role.LIBRARIAN)
@Controller('milestones/tenants/:tenantId')
export class ProjectMilestonesController {
  constructor(private readonly service: ProjectMilestonesService) {}

  // ── Projects (stub registration) ──────────────────────────────────────────

  /**
   * Register a project stub so the milestones service can resolve membership
   * without coupling to the project-planning module.  Call this once per
   * project, before creating milestones.
   */
  @Post('projects')
  @ApiOperation({
    summary: 'Register a project stub for milestone tenant isolation (CAPSTONE-060)',
    description:
      'Creates or replaces the project stub used by the milestones service to ' +
      'enforce tenant boundaries and project-role authorization. The caller must ' +
      'supply the project id and the initial membership map.',
  })
  @ApiResponse({ status: 201, description: 'Project stub registered' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  registerProject(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() body: RegisterProjectDto,
  ) {
    const stub: MilestoneProjectStub = {
      id: body.projectId,
      tenantId,
      members: body.members ?? {},
    };
    this.service.registerProject(this.actor(tenantId, user), tenantId, stub);
    return { projectId: stub.id, tenantId };
  }

  // ── Milestone CRUD ────────────────────────────────────────────────────────

  @Post('projects/:projectId/milestones')
  @ApiOperation({
    summary: 'Create a project milestone (CAPSTONE-060)',
    description:
      'Creates a new milestone in DRAFT status.  The sequence is assigned ' +
      'automatically (max existing + 1).  Dependency IDs must reference ' +
      'milestones in the same project; cyclic dependencies are rejected with ' +
      'BIZ_MILESTONE_CYCLE_DETECTED.',
  })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  @ApiResponse({ status: 201, description: 'Milestone created' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT | VAL_MILESTONE_DATE_INVALID' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 409, description: 'BIZ_IDEMPOTENCY_KEY_REUSED' })
  @ApiResponse({ status: 422, description: 'BIZ_MILESTONE_CYCLE_DETECTED' })
  createMilestone(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.service.createMilestone(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      dto,
    );
  }

  @Get('projects/:projectId/milestones')
  @ApiOperation({
    summary: 'List milestones for a project, ordered by sequence (CAPSTONE-060)',
  })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  @ApiResponse({ status: 200, description: 'Ordered list of redacted milestone views' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 404, description: 'RES_NOT_FOUND' })
  listMilestones(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listMilestones(
      this.actor(tenantId, user),
      tenantId,
      projectId,
    );
  }

  @Get('milestones/:milestoneId')
  @ApiOperation({
    summary: 'Get a single milestone by ID (CAPSTONE-060)',
  })
  @ApiParam({ name: 'milestoneId', description: 'Milestone identifier' })
  @ApiResponse({ status: 200, description: 'Redacted milestone view' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 404, description: 'RES_MILESTONE_NOT_FOUND' })
  getMilestone(
    @Param('tenantId') tenantId: string,
    @Param('milestoneId') milestoneId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getMilestoneById(
      this.actor(tenantId, user),
      tenantId,
      milestoneId,
    );
  }

  @Patch('milestones/:milestoneId')
  @ApiOperation({
    summary: 'Update a DRAFT milestone (CAPSTONE-060)',
    description:
      'Only milestones in DRAFT status may be updated.  All fields are optional; ' +
      'omitted fields retain their current values.  Dependency cycles are rejected.',
  })
  @ApiParam({ name: 'milestoneId', description: 'Milestone identifier' })
  @ApiResponse({ status: 200, description: 'Updated milestone view' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT | VAL_MILESTONE_DATE_INVALID' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 404, description: 'RES_MILESTONE_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'BIZ_IDEMPOTENCY_KEY_REUSED' })
  @ApiResponse({ status: 422, description: 'BIZ_MILESTONE_INVALID_TRANSITION | BIZ_MILESTONE_CYCLE_DETECTED' })
  updateMilestone(
    @Param('tenantId') tenantId: string,
    @Param('milestoneId') milestoneId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.service.updateMilestone(
      this.actor(tenantId, user),
      tenantId,
      milestoneId,
      dto,
    );
  }

  // ── Lifecycle transitions ─────────────────────────────────────────────────

  @Post('milestones/:milestoneId/transitions')
  @ApiOperation({
    summary: 'Transition a milestone status (CAPSTONE-060)',
    description:
      'Allowed transitions: DRAFT→ACTIVE, DRAFT→CANCELLED, ACTIVE→COMPLETED, ' +
      'ACTIVE→CANCELLED.  ACTIVE requires all dependencies to be COMPLETED.  ' +
      'CANCELLED requires a non-empty cancellationReason.  COMPLETED requires the ' +
      'caller to hold the REVIEWER or OWNER project role.  Terminal states ' +
      '(COMPLETED, CANCELLED) are irreversible.',
  })
  @ApiParam({ name: 'milestoneId', description: 'Milestone identifier' })
  @ApiResponse({ status: 201, description: 'Milestone transitioned' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 404, description: 'RES_MILESTONE_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'BIZ_IDEMPOTENCY_KEY_REUSED' })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_MILESTONE_INVALID_TRANSITION | BIZ_MILESTONE_DEPENDENCY_NOT_MET',
  })
  transitionMilestone(
    @Param('tenantId') tenantId: string,
    @Param('milestoneId') milestoneId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: TransitionMilestoneDto,
  ) {
    return this.service.transitionMilestone(
      this.actor(tenantId, user),
      tenantId,
      milestoneId,
      dto,
    );
  }

  // ── Reviewer assignment ───────────────────────────────────────────────────

  @Post('milestones/:milestoneId/reviewer')
  @ApiOperation({
    summary: 'Assign or replace the reviewer for a milestone (CAPSTONE-060)',
    description:
      'Only OWNER and PLANNER roles may assign reviewers.  Assignment is ' +
      'blocked on terminal milestones (COMPLETED, CANCELLED).',
  })
  @ApiParam({ name: 'milestoneId', description: 'Milestone identifier' })
  @ApiResponse({ status: 201, description: 'Reviewer assigned' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 404, description: 'RES_MILESTONE_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'BIZ_IDEMPOTENCY_KEY_REUSED' })
  @ApiResponse({ status: 422, description: 'BIZ_MILESTONE_ALREADY_COMPLETED' })
  assignReviewer(
    @Param('tenantId') tenantId: string,
    @Param('milestoneId') milestoneId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: AssignReviewerDto,
  ) {
    return this.service.assignReviewer(
      this.actor(tenantId, user),
      tenantId,
      milestoneId,
      dto,
    );
  }

  @Get('audit')
  @ApiOperation({
    summary: 'Read milestone audit metadata (CAPSTONE-060)',
  })
  @ApiResponse({ status: 200, description: 'Tenant audit metadata' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  getAudit(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getAudit(this.actor(tenantId, user), tenantId);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private actor(
    tenantId: string,
    user: Record<string, unknown> | undefined,
  ): MilestonesActor | undefined {
    if (!user) return undefined;
    return {
      actorId: typeof user['sub'] === 'string' ? user['sub'] : '',
      tenantId,
      roles: typeof user['role'] === 'string' ? [user['role']] : [],
    };
  }
}
