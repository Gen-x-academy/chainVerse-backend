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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditActor } from '../../common/audit';
import type { AuditContext } from '../../common/audit';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  AddMemberDto,
  CloseProjectDto,
  CreateWorkspaceDto,
  ProjectClosureConsentDto,
  UpdateWorkspaceDto,
  WorkspaceStatusDto,
} from '../dto/project-workspace.dto';
import { ProjectClosureService } from '../services/project-closure.service';
import { ProjectWorkspaceService } from '../services/project-workspace.service';

@ApiTags('Project Workspace')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('project-workspaces')
export class ProjectWorkspaceController {
  constructor(
    private readonly service: ProjectWorkspaceService,
    private readonly closures: ProjectClosureService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a scoped project collaboration workspace' })
  create(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.service.create(actorId, audit, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List workspaces the caller is a member of' })
  list(
    @CurrentUser('sub') actorId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.service.list(actorId, tenantId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a workspace overview, members and next actions',
  })
  findOne(@CurrentUser('sub') actorId: string, @Param('id') id: string) {
    return this.service.findOne(actorId, id);
  }

  @Get(':id/overview')
  @ApiOperation({
    summary: 'Aggregated workspace home with activity and counts',
  })
  overview(@CurrentUser('sub') actorId: string, @Param('id') id: string) {
    return this.service.overview(actorId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workspace details with optimistic locking' })
  update(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.service.update(actorId, audit, id, dto);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Advance the workspace lifecycle state' })
  changeStatus(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('id') id: string,
    @Body() dto: WorkspaceStatusDto,
  ) {
    return this.service.changeStatus(actorId, audit, id, dto);
  }

  @Post(':id/closure')
  @ApiOperation({
    summary: 'Complete or terminate a project with a structured outcome',
  })
  @ApiResponse({
    status: 201,
    description: 'Project closed or mutual-termination proposal created',
  })
  @ApiResponse({
    status: 403,
    description: 'AUTH_INSUFFICIENT_PERMISSIONS',
  })
  @ApiResponse({
    status: 409,
    description:
      'BIZ_IDEMPOTENCY_KEY_REUSED or BIZ_WORKSPACE_ALREADY_CLOSED',
  })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_WORKSPACE_STALE_VERSION, BIZ_WORKSPACE_INVALID_TRANSITION, or BIZ_WORKSPACE_COMPLETION_INCOMPLETE',
  })
  close(
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: string,
    @AuditActor() audit: AuditContext,
    @Param('id') id: string,
    @Body() dto: CloseProjectDto,
  ) {
    return this.closures.close(actorId, actorRole, audit, id, dto);
  }

  @Post(':id/closure-consents')
  @ApiOperation({
    summary: 'Record a member consent for a mutual project termination',
  })
  @ApiResponse({ status: 201, description: 'Consent recorded or replayed' })
  @ApiResponse({
    status: 403,
    description: 'AUTH_INSUFFICIENT_PERMISSIONS',
  })
  @ApiResponse({
    status: 409,
    description:
      'BIZ_WORKSPACE_CONSENT_EXISTS, BIZ_IDEMPOTENCY_KEY_REUSED, or BIZ_WORKSPACE_ALREADY_CLOSED',
  })
  @ApiResponse({
    status: 422,
    description: 'BIZ_WORKSPACE_STALE_VERSION',
  })
  consentToClosure(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('id') id: string,
    @Body() dto: ProjectClosureConsentDto,
  ) {
    return this.closures.consent(actorId, audit, id, dto);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member with an explicit workspace role' })
  addMember(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.service.addMember(actorId, audit, id, dto);
  }
}
