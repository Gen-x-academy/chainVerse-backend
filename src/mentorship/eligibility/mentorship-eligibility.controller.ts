import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { MentorshipEligibilityService } from './mentorship-eligibility.service';
import {
  PreflightDto,
  PreflightResultDto,
  preflightSchema,
  PublishRulesDto,
  publishRulesSchema,
} from './dto/eligibility.dto';

/** MENTOR-033 – eligibility rules and preflight. */
@ApiTags('Mentorship – Eligibility')
@ApiBearerAuth('access-token')
@UseGuards(MentorshipAuthGuard)
@Controller('mentorship/programs/:programId/eligibility')
export class MentorshipEligibilityController {
  constructor(private readonly service: MentorshipEligibilityService) {}

  @Post('preflight')
  @HttpCode(200)
  @MentorshipPolicy('eligibility.preflight', ANY_ROLE)
  @ApiOperation({
    summary: 'Evaluate eligibility before submitting',
    description:
      'Runs the exact evaluator used at submission against the current form and rule-set versions. ' +
      'Safe to retry: identical input is recorded once. Sensitive rules are reported generically.',
  })
  @ApiBody({ type: PreflightDto })
  @ApiResponse({ status: 200, type: PreflightResultDto })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT | MENTOR_INVALID_ANSWERS' })
  @ApiResponse({ status: 404, description: 'MENTOR_PROGRAM_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'MENTOR_FORM_NOT_PUBLISHED' })
  @ApiResponse({ status: 503, description: 'SYS_SERVICE_UNAVAILABLE – retry' })
  preflight(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Body(new JoiValidationPipe(preflightSchema)) dto: PreflightDto,
  ) {
    return this.service.preflight(ctx, programId, dto);
  }

  @Get('rules')
  @MentorshipPolicy('eligibility.rules.read', STAFF_ROLES)
  @ApiOperation({ summary: 'Get the current rule set (owner/admin only – may contain sensitive params)' })
  current(@MentorshipCtx() ctx: MentorshipRequestContext, @Param('programId') programId: string) {
    return this.service.getRules(ctx, programId);
  }

  @Get('rules/:version')
  @MentorshipPolicy('eligibility.rules.read', STAFF_ROLES)
  @ApiOperation({ summary: 'Get a historical rule-set version (owner/admin only)' })
  byVersion(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.service.getRules(ctx, programId, version);
  }

  @Put('rules')
  @MentorshipPolicy('eligibility.rules.publish', STAFF_ROLES)
  @ApiOperation({ summary: 'Publish a new immutable rule-set version (idempotent for identical content)' })
  @ApiBody({ type: PublishRulesDto })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT | MENTOR_UNSAFE_MARKUP' })
  @ApiResponse({ status: 409, description: 'MENTOR_STALE_VERSION' })
  publish(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Body(new JoiValidationPipe(publishRulesSchema)) dto: PublishRulesDto,
  ) {
    return this.service.publishRules(ctx, programId, dto.rules, dto.expectedCurrentVersion);
  }
}
