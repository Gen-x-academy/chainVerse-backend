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
  CreatePrivateNoteDto,
  NoteVersionDto,
  UpdatePrivateNoteDto,
} from '../dto/project-workspace.dto';
import { PrivateNoteService } from '../services/private-note.service';

@ApiTags('Private Researcher Notes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('project-workspaces/:projectId/private-notes')
export class PrivateNotesController {
  constructor(private readonly service: PrivateNoteService) {}

  @Post()
  @ApiOperation({ summary: 'Create an owner-only encrypted researcher note' })
  create(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreatePrivateNoteDto,
  ) {
    return this.service.create(actorId, audit, projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List only the caller's own private notes" })
  list(
    @CurrentUser('sub') actorId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.service.list(actorId, projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: "Decrypt and read the caller's own private note" })
  findOne(
    @CurrentUser('sub') actorId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(actorId, projectId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('sub') actorId: string,
    @AuditActor() audit: AuditContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePrivateNoteDto,
  ) {
    return this.service.update(actorId, audit, projectId, id, dto);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive an owner-only private note' })
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
