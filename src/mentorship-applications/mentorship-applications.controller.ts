import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { MentorshipApplicationsService } from './mentorship-applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { IDEMPOTENCY_HEADER } from './mentorship-applications.constants';

type AuthedRequest = { user: { id: string } };

const IDEMPOTENCY_HEADER_DOC = {
  name: 'Idempotency-Key',
  required: false,
  description:
    'Client-generated key (8–128 chars). Retries with the same key return the original result.',
};

/**
 * Mentee-facing application endpoints. Every route requires an authenticated
 * student, and every query is scoped to the caller's own applications.
 */
@ApiTags('Mentorship Applications')
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Caller is not a student' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('mentorship/applications')
export class MentorshipApplicationsController {
  constructor(private readonly service: MentorshipApplicationsService) {}

  @Post()
  @ApiOperation({ summary: 'Start a mentorship application draft (MENTOR-030)' })
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ApiNotFoundResponse({ description: 'RES_MENTORSHIP_FORM_NOT_FOUND' })
  @ApiConflictResponse({ description: 'BIZ_ACTIVE_APPLICATION_EXISTS' })
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateApplicationDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey?: string,
  ) {
    return this.service.create(req.user.id, dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'List my applications, newest first (resumable drafts included)' })
  @ApiQuery({ name: 'programId', required: false })
  listMine(@Req() req: AuthedRequest, @Query('programId') programId?: string) {
    return this.service.listMine(req.user.id, programId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my applications to resume editing' })
  @ApiNotFoundResponse({ description: 'RES_MENTORSHIP_APPLICATION_NOT_FOUND' })
  getMine(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.service.getMine(req.user.id, id);
  }

  @Patch(':id/draft')
  @ApiOperation({
    summary: 'Autosave draft fields (MENTOR-031)',
    description:
      'Partial update guarded by baseRevision. Returns the new revision, lastSavedAt ' +
      'and per-field timestamps. Fields changed elsewhere since baseRevision produce ' +
      '409 BIZ_DRAFT_REVISION_CONFLICT with details.conflicts; nothing is overwritten.',
  })
  @ApiConflictResponse({
    description: 'BIZ_DRAFT_REVISION_CONFLICT or BIZ_APPLICATION_NOT_DRAFT',
  })
  saveDraft(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.service.saveDraft(req.user.id, id, dto);
  }

  @Post(':id/rebase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a draft onto the current form version' })
  @ApiConflictResponse({ description: 'BIZ_DRAFT_REVISION_CONFLICT' })
  rebase(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SubmitApplicationDto,
  ) {
    return this.service.rebaseToCurrentForm(req.user.id, id, dto.revision);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a complete draft (MENTOR-030)' })
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ApiConflictResponse({
    description: 'BIZ_DRAFT_REVISION_CONFLICT or BIZ_APPLICATION_NOT_DRAFT',
  })
  @ApiUnprocessableEntityResponse({
    description: 'BIZ_APPLICATION_INCOMPLETE or BIZ_FORM_VERSION_OUTDATED',
  })
  submit(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SubmitApplicationDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey?: string,
  ) {
    return this.service.submit(req.user.id, id, dto, idempotencyKey);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Discard a draft (submitted applications cannot be discarded)' })
  @ApiConflictResponse({ description: 'BIZ_APPLICATION_NOT_DRAFT' })
  discard(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.service.discardDraft(req.user.id, id);
  }
}
