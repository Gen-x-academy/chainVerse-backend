import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JoiValidationPipe } from '../shared/joi-validation.pipe';
import { MentorshipAuthGuard } from '../shared/mentorship-auth.guard';
import { MentorshipCtx, MentorshipRequestContext } from '../shared/mentorship-context';
import { ANY_ROLE, MentorshipPolicy, STAFF_ROLES } from '../shared/mentorship-policy.decorator';
import { MentorshipFormsService } from './mentorship-forms.service';
import {
  PublishFormDto,
  publishFormSchema,
  UpdateFormDraftDto,
  updateFormDraftSchema,
} from './dto/form.dto';

/** MENTOR-032 – configurable, versioned application questions. */
@ApiTags('Mentorship – Application forms')
@ApiBearerAuth('access-token')
@UseGuards(MentorshipAuthGuard)
@Controller('mentorship/programs/:programId/forms')
export class MentorshipFormsController {
  constructor(private readonly service: MentorshipFormsService) {}

  @Get('current')
  @MentorshipPolicy('form.read_current', ANY_ROLE)
  @ApiOperation({ summary: 'Get the published form applicants should fill in' })
  @ApiResponse({ status: 422, description: 'MENTOR_FORM_NOT_PUBLISHED' })
  current(@MentorshipCtx() ctx: MentorshipRequestContext, @Param('programId') programId: string) {
    return this.service.getCurrentPublished(ctx, programId);
  }

  @Get('versions')
  @MentorshipPolicy('form.list_versions', STAFF_ROLES)
  @ApiOperation({ summary: 'List form versions (owner, admin, scoped reviewers)' })
  list(@MentorshipCtx() ctx: MentorshipRequestContext, @Param('programId') programId: string) {
    return this.service.listVersions(ctx, programId);
  }

  @Post('versions')
  @MentorshipPolicy('form.create_draft', STAFF_ROLES)
  @ApiOperation({
    summary: 'Open a draft (seeded from the latest published version). Idempotent: returns the existing draft if any.',
  })
  @ApiResponse({ status: 201, description: '`created` is false when an existing draft was returned' })
  createDraft(@MentorshipCtx() ctx: MentorshipRequestContext, @Param('programId') programId: string) {
    return this.service.createDraft(ctx, programId);
  }

  @Get('versions/:version')
  @MentorshipPolicy('form.read_version', STAFF_ROLES)
  @ApiOperation({ summary: 'Get any form version, including historical ones' })
  getVersion(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.service.getVersion(ctx, programId, version);
  }

  @Put('versions/:version')
  @MentorshipPolicy('form.update_draft', STAFF_ROLES)
  @ApiOperation({ summary: 'Replace the questions of a draft (optimistic concurrency via expectedRevision)' })
  @ApiBody({ type: UpdateFormDraftDto })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT | MENTOR_FORM_INVALID_DEFINITION | MENTOR_UNSAFE_MARKUP' })
  @ApiResponse({ status: 409, description: 'MENTOR_FORM_VERSION_IMMUTABLE | MENTOR_STALE_VERSION' })
  updateDraft(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body(new JoiValidationPipe(updateFormDraftSchema)) dto: UpdateFormDraftDto,
  ) {
    return this.service.updateDraft(ctx, programId, version, dto.questions, dto.expectedRevision);
  }

  @Post('versions/:version/publish')
  @MentorshipPolicy('form.publish', STAFF_ROLES)
  @ApiOperation({ summary: 'Publish a draft – it becomes immutable and current. Idempotent.' })
  @ApiBody({ type: PublishFormDto })
  @ApiResponse({ status: 409, description: 'MENTOR_STALE_VERSION' })
  @ApiResponse({ status: 422, description: 'MENTOR_FORM_INVALID_DEFINITION' })
  publish(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body(new JoiValidationPipe(publishFormSchema)) dto: PublishFormDto,
  ) {
    return this.service.publish(ctx, programId, version, dto.expectedRevision);
  }
}
