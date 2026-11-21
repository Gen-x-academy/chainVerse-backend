import {
  Body,
  Controller,
  Delete,
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
  AddDependencyDto,
  AdvancePackageStatusDto,
  AssignRoleDto,
  CreateTaskDto,
  CreateWbsDto,
  CreateWorkPackageDto,
  SetEstimateDto,
  UpdateTaskDto,
  UpdateWbsDto,
  UpdateWorkPackageDto,
} from './dto/work-breakdown.dto';
import { WorkBreakdownService } from './work-breakdown.service';
import { WbsActor } from './work-breakdown.types';

/**
 * CAPSTONE-058 — Work Breakdown Structures API
 *
 * Base path: /wbs/tenants/:tenantId
 *
 * All routes require a valid Bearer JWT (JwtAuthGuard is registered globally)
 * and at least one of the five platform roles.
 */
@ApiTags('Work Breakdown Structures')
@ApiBearerAuth('access-token')
@ApiParam({ name: 'tenantId', description: 'Tenant that owns the WBS data' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT, Role.LIBRARIAN)
@Controller('wbs/tenants/:tenantId')
export class WorkBreakdownController {
  constructor(private readonly service: WorkBreakdownService) {}

  // ── WBS ──────────────────────────────────────────────────────────────────

  @Post('wbs')
  @ApiOperation({ summary: 'Create a new Work Breakdown Structure (CAPSTONE-058)' })
  @ApiResponse({ status: 201, description: 'WBS created' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  createWbs(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: CreateWbsDto,
  ) {
    return this.service.createWbs(this.actor(tenantId, user), tenantId, dto);
  }

  @Get('projects/:projectId/wbs')
  @ApiOperation({ summary: 'List all WBS structures for a project' })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  listWbs(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listWbs(this.actor(tenantId, user), tenantId, projectId);
  }

  @Get('wbs/:wbsId')
  @ApiOperation({ summary: 'Retrieve a single WBS by ID' })
  @ApiParam({ name: 'wbsId', description: 'WBS identifier' })
  getWbs(
    @Param('tenantId') tenantId: string,
    @Param('wbsId') wbsId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getWbs(this.actor(tenantId, user), tenantId, wbsId);
  }

  @Patch('wbs/:wbsId')
  @ApiOperation({ summary: 'Update WBS title, description, or package order' })
  @ApiParam({ name: 'wbsId', description: 'WBS identifier' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  updateWbs(
    @Param('tenantId') tenantId: string,
    @Param('wbsId') wbsId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: UpdateWbsDto,
  ) {
    return this.service.updateWbs(
      this.actor(tenantId, user),
      tenantId,
      wbsId,
      dto,
    );
  }

  // ── Work Packages ─────────────────────────────────────────────────────────

  @Post('wbs/:wbsId/packages')
  @ApiOperation({ summary: 'Add an ordered work package to a WBS' })
  @ApiParam({ name: 'wbsId', description: 'WBS identifier' })
  @ApiResponse({ status: 201, description: 'Work package created' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  createPackage(
    @Param('tenantId') tenantId: string,
    @Param('wbsId') wbsId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: CreateWorkPackageDto,
  ) {
    return this.service.createPackage(
      this.actor(tenantId, user),
      tenantId,
      wbsId,
      dto,
    );
  }

  @Get('wbs/:wbsId/packages')
  @ApiOperation({ summary: 'List all work packages in a WBS, ordered' })
  @ApiParam({ name: 'wbsId', description: 'WBS identifier' })
  listPackages(
    @Param('tenantId') tenantId: string,
    @Param('wbsId') wbsId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listPackages(
      this.actor(tenantId, user),
      tenantId,
      wbsId,
    );
  }

  @Get('packages/:packageId')
  @ApiOperation({ summary: 'Get a single work package' })
  @ApiParam({ name: 'packageId', description: 'Package identifier' })
  getPackage(
    @Param('tenantId') tenantId: string,
    @Param('packageId') packageId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getPackage(
      this.actor(tenantId, user),
      tenantId,
      packageId,
    );
  }

  @Patch('packages/:packageId')
  @ApiOperation({ summary: 'Update work package details (title, assignees, criteria, weight)' })
  @ApiParam({ name: 'packageId', description: 'Package identifier' })
  @ApiResponse({ status: 422, description: 'BIZ_INVALID_STATE_TRANSITION' })
  updatePackage(
    @Param('tenantId') tenantId: string,
    @Param('packageId') packageId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: UpdateWorkPackageDto,
  ) {
    return this.service.updatePackage(
      this.actor(tenantId, user),
      tenantId,
      packageId,
      dto,
    );
  }

  @Post('packages/:packageId/status')
  @ApiOperation({ summary: 'Advance the lifecycle state of a work package' })
  @ApiParam({ name: 'packageId', description: 'Package identifier' })
  @ApiResponse({ status: 422, description: 'BIZ_INVALID_STATE_TRANSITION' })
  advanceStatus(
    @Param('tenantId') tenantId: string,
    @Param('packageId') packageId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: AdvancePackageStatusDto,
  ) {
    return this.service.advanceStatus(
      this.actor(tenantId, user),
      tenantId,
      packageId,
      dto,
    );
  }

  @Post('packages/:packageId/estimate')
  @ApiOperation({ summary: 'Set or replace the effort estimate on a work package' })
  @ApiParam({ name: 'packageId', description: 'Package identifier' })
  @ApiResponse({ status: 422, description: 'BIZ_INVALID_STATE_TRANSITION' })
  setEstimate(
    @Param('tenantId') tenantId: string,
    @Param('packageId') packageId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: SetEstimateDto,
  ) {
    return this.service.setEstimate(
      this.actor(tenantId, user),
      tenantId,
      packageId,
      dto,
    );
  }

  @Post('packages/:packageId/roles')
  @ApiOperation({ summary: 'Assign a role to a user on a work package' })
  @ApiParam({ name: 'packageId', description: 'Package identifier' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  assignRole(
    @Param('tenantId') tenantId: string,
    @Param('packageId') packageId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: AssignRoleDto,
  ) {
    return this.service.assignRole(
      this.actor(tenantId, user),
      tenantId,
      packageId,
      dto,
    );
  }

  // ── Dependencies ──────────────────────────────────────────────────────────

  @Post('wbs/:wbsId/dependencies')
  @ApiOperation({ summary: 'Add a dependency edge between two work packages' })
  @ApiParam({ name: 'wbsId', description: 'WBS identifier' })
  @ApiResponse({ status: 422, description: 'BIZ_INVALID_STATE_TRANSITION — cycle detected' })
  @ApiResponse({ status: 409, description: 'RES_ALREADY_EXISTS — duplicate edge' })
  addDependency(
    @Param('tenantId') tenantId: string,
    @Param('wbsId') wbsId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: AddDependencyDto,
  ) {
    return this.service.addDependency(
      this.actor(tenantId, user),
      tenantId,
      wbsId,
      dto,
    );
  }

  @Get('wbs/:wbsId/dependencies')
  @ApiOperation({ summary: 'List all dependency edges in a WBS' })
  @ApiParam({ name: 'wbsId', description: 'WBS identifier' })
  listDependencies(
    @Param('tenantId') tenantId: string,
    @Param('wbsId') wbsId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listDependencies(
      this.actor(tenantId, user),
      tenantId,
      wbsId,
    );
  }

  @Delete('dependencies/:dependencyId')
  @ApiOperation({ summary: 'Remove a dependency edge' })
  @ApiParam({ name: 'dependencyId', description: 'Dependency identifier' })
  removeDependency(
    @Param('tenantId') tenantId: string,
    @Param('dependencyId') dependencyId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.removeDependency(
      this.actor(tenantId, user),
      tenantId,
      dependencyId,
    );
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  @Post('packages/:packageId/tasks')
  @ApiOperation({ summary: 'Create a task inside a work package' })
  @ApiParam({ name: 'packageId', description: 'Package identifier' })
  @ApiResponse({ status: 201, description: 'Task created' })
  @ApiResponse({ status: 422, description: 'BIZ_INVALID_STATE_TRANSITION' })
  createTask(
    @Param('tenantId') tenantId: string,
    @Param('packageId') packageId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: CreateTaskDto,
  ) {
    return this.service.createTask(
      this.actor(tenantId, user),
      tenantId,
      packageId,
      dto,
    );
  }

  @Get('packages/:packageId/tasks')
  @ApiOperation({ summary: 'List tasks for a work package' })
  @ApiParam({ name: 'packageId', description: 'Package identifier' })
  listTasks(
    @Param('tenantId') tenantId: string,
    @Param('packageId') packageId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listTasks(
      this.actor(tenantId, user),
      tenantId,
      packageId,
    );
  }

  @Patch('tasks/:taskId')
  @ApiOperation({ summary: 'Update a task (title, done, assignee, due date)' })
  @ApiParam({ name: 'taskId', description: 'Task identifier' })
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

  // ── Progress ──────────────────────────────────────────────────────────────

  @Get('wbs/:wbsId/progress')
  @ApiOperation({ summary: 'Weighted progress report across all packages in a WBS' })
  @ApiParam({ name: 'wbsId', description: 'WBS identifier' })
  progressReport(
    @Param('tenantId') tenantId: string,
    @Param('wbsId') wbsId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.progressReport(
      this.actor(tenantId, user),
      tenantId,
      wbsId,
    );
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private actor(
    tenantId: string,
    user: Record<string, unknown> | undefined,
  ): WbsActor | undefined {
    if (!user) return undefined;
    return {
      actorId: typeof user['sub'] === 'string' ? user['sub'] : '',
      tenantId,
      roles: typeof user['role'] === 'string' ? [user['role']] : [],
    };
  }
}
