import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditActor } from '../../common/audit';
import type { AuditContext } from '../../common/audit';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CreateResourceDto,
  ReviewResourceDto,
  UpdateResourceDto,
} from '../dto/project-workspace.dto';
import { ResourceLibraryService } from '../services/resource-library.service';

@ApiTags('Project Resource Library')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('project-workspaces/:projectId/resources')
export class ResourceLibraryController {
  constructor(private readonly service: ResourceLibraryService) {}

  @Post()
  @ApiOperation({
    summary: 'Submit a file, dataset or link with integrity metadata',
  })
  submit(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateResourceDto,
  ) {
    return this.service.submit(actorId, audit, projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List approved resources allowed by access policy' })
  list(
    @CurrentUser('sub') actorId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.service.list(actorId, projectId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('sub') actorId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(actorId, projectId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Revise a pending or rejected resource atomically' })
  update(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.service.update(actorId, audit, projectId, id, dto);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve a pending resource (workspace owner only)',
  })
  approve(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ReviewResourceDto,
  ) {
    return this.service.approve(actorId, audit, projectId, id, dto);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending resource with a reason' })
  reject(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ReviewResourceDto,
  ) {
    return this.service.reject(actorId, audit, projectId, id, dto);
  }

  @Post(':id/archive')
  @ApiOperation({
    summary: 'Archive an approved resource, keeping version history',
  })
  archive(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ReviewResourceDto,
  ) {
    return this.service.archive(actorId, audit, projectId, id, dto);
  }
}
