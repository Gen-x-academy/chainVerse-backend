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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspace.dto';
import { MentorshipWorkspaceService } from './mentorship-workspace.service';

@ApiTags('Mentorship Workspace')
@ApiBearerAuth('access-token')
@Controller('mentorship/workspaces')
@UseGuards(JwtAuthGuard)
export class MentorshipWorkspaceController {
  constructor(private readonly service: MentorshipWorkspaceService) {}

  private actor(userId: string, roles?: string[]) {
    return { userId, roles: roles ?? [] };
  }

  @Post()
  @ApiOperation({
    summary: 'Create a session workspace (idempotent per session)',
  })
  create(
    @Body() dto: CreateWorkspaceDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.create(dto, this.actor(userId, roles));
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get session workspace' })
  get(
    @Param('sessionId') sessionId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.getBySession(sessionId, this.actor(userId, roles));
  }

  @Patch(':sessionId')
  @ApiOperation({ summary: 'Update session workspace' })
  update(
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateWorkspaceDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.update(sessionId, dto, this.actor(userId, roles));
  }

  @Post(':sessionId/read-only')
  @ApiOperation({ summary: 'Mark workspace read-only (cancelled session)' })
  markReadOnly(
    @Param('sessionId') sessionId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.markReadOnly(sessionId, this.actor(userId, roles));
  }
}
