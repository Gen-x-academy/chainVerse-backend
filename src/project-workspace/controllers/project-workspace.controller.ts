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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditActor } from '../../common/audit';
import type { AuditContext } from '../../common/audit';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  AddMemberDto,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceStatusDto,
} from '../dto/project-workspace.dto';
import { ProjectWorkspaceService } from '../services/project-workspace.service';

@ApiTags('Project Workspace')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('project-workspaces')
export class ProjectWorkspaceController {
  constructor(private readonly service: ProjectWorkspaceService) {}

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
