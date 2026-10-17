import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JoiValidationPipe } from '../shared/joi-validation.pipe';
import { MentorshipAuthGuard } from '../shared/mentorship-auth.guard';
import { MentorshipCtx, MentorshipRequestContext } from '../shared/mentorship-context';
import { ANY_ROLE, MentorshipPolicy } from '../shared/mentorship-policy.decorator';
import { MentorshipApplicationsService } from './mentorship-applications.service';
import { SubmitApplicationDto, submitApplicationSchema } from './dto/application.dto';

@ApiTags('Mentorship – Applications')
@ApiBearerAuth('access-token')
@UseGuards(MentorshipAuthGuard)
@Controller('mentorship')
export class MentorshipApplicationsController {
  constructor(private readonly service: MentorshipApplicationsService) {}

  @Post('programs/:programId/applications')
  @MentorshipPolicy('application.submit', ANY_ROLE)
  @ApiOperation({
    summary: 'Submit an application',
    description:
      'Enforces the same eligibility evaluation as preflight. Retrying with identical answers returns the stored ' +
      'application with `created: false`.',
  })
  @ApiBody({ type: SubmitApplicationDto })
  @ApiResponse({ status: 201, description: 'Created, or replayed (`created: false`)' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT | MENTOR_INVALID_ANSWERS' })
  @ApiResponse({ status: 409, description: 'MENTOR_STALE_VERSION | MENTOR_ALREADY_APPLIED' })
  @ApiResponse({ status: 422, description: 'MENTOR_ELIGIBILITY_FAILED | MENTOR_ELIGIBILITY_NEEDS_INFORMATION | MENTOR_FORM_NOT_PUBLISHED' })
  submit(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Body(new JoiValidationPipe(submitApplicationSchema)) dto: SubmitApplicationDto,
  ) {
    return this.service.submit(ctx, programId, dto);
  }

  @Get('applications/mine')
  @MentorshipPolicy('application.list_mine', ANY_ROLE)
  @ApiOperation({ summary: "List the caller's own applications" })
  mine(@MentorshipCtx() ctx: MentorshipRequestContext) {
    return this.service.listMine(ctx);
  }

  @Get('applications/:applicationId')
  @MentorshipPolicy('application.read', ANY_ROLE)
  @ApiOperation({
    summary: 'Render an application with the form version it was submitted against',
    description: 'Applicants see their own; staff see review state. Conflicted reviewers are refused.',
  })
  @ApiResponse({ status: 404, description: 'MENTOR_APPLICATION_NOT_FOUND (also returned when not permitted)' })
  @ApiResponse({ status: 409, description: 'MENTOR_CONFLICT_OF_INTEREST' })
  render(@MentorshipCtx() ctx: MentorshipRequestContext, @Param('applicationId') applicationId: string) {
    return this.service.render(ctx, applicationId);
  }
}
