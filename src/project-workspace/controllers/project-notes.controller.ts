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
  CreateNoteDto,
  NoteVersionDto,
  UpdateNoteDto,
} from '../dto/project-workspace.dto';
import { ProjectNoteService } from '../services/project-note.service';

@ApiTags('Project Notes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('project-workspaces/:projectId/notes')
export class ProjectNotesController {
  constructor(private readonly service: ProjectNoteService) {}

  @Post()
  @ApiOperation({ summary: 'Create a team-visible note with safe rendering' })
  create(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.service.create(actorId, audit, projectId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List shared notes (private notes are never included)',
  })
  list(
    @CurrentUser('sub') actorId: string,
    @Param('projectId') projectId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.service.list(actorId, projectId, includeArchived === 'true');
  }

  @Get(':id')
  findOne(
    @CurrentUser('sub') actorId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(actorId, projectId, id);
  }

  @Get(':id/revisions')
  @ApiOperation({ summary: 'Read the revision history of a shared note' })
  revisions(
    @CurrentUser('sub') actorId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.revisions(actorId, projectId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.service.update(actorId, audit, projectId, id, dto);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a shared note, preserving revisions' })
  archive(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: NoteVersionDto,
  ) {
    return this.service.archive(actorId, audit, projectId, id, dto);
  }
}
