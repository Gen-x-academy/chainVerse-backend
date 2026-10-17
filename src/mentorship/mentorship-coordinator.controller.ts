import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { Idempotent } from '../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import {
  CoordinatorAdjustProposalDto,
  CoordinatorCreateProposalDto,
  CoordinatorWithdrawProposalDto,
  OverrideReportQueryDto,
} from './dto/coordinator-proposal.dto';
import { SetEligibilityDto } from './dto/mentorship-profile.dto';
import { CoordinatorQueryProposalsDto } from './dto/query-proposals.dto';
import { MatchProposalService } from './match-proposal.service';
import { Actor, MentorshipAccessGuard } from './mentorship-access.guard';
import { MentorshipCoordinatorService } from './mentorship-coordinator.service';
import { MentorshipProfileService } from './mentorship-profile.service';
import { MENTORSHIP_COORDINATOR_ROLES } from './mentorship.constants';
import type { MentorshipActor } from './mentorship.policy';

const IDEMPOTENCY_HEADER = {
  name: 'X-Idempotency-Key',
  required: true,
  description: 'Unique per logical request; retries with the same key replay the first response',
};

/** Coordinator-assisted matching (MENTOR-039). Admin and moderator roles only. */
@ApiTags('mentorship-coordinator')
@ApiBearerAuth('access-token')
@ApiResponse({ status: 401, description: 'Missing or invalid access token' })
@ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
@Controller('mentorship/coordinator')
@UseGuards(MentorshipAccessGuard)
@UseInterceptors(IdempotencyInterceptor)
@Roles(...MENTORSHIP_COORDINATOR_ROLES)
export class MentorshipCoordinatorController {
  constructor(
    private readonly coordinator: MentorshipCoordinatorService,
    private readonly proposals: MatchProposalService,
    private readonly profiles: MentorshipProfileService,
  ) {}

  @Post('proposals')
  @Idempotent()
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Propose a match between two participants',
    description:
      'Hard eligibility and blocks are always enforced. Failed soft checks need an explicit override with a reason. Both participants must still approve. Pass supersedesProposalId to reassign.',
  })
  @ApiResponse({ status: 201, description: 'Proposal created' })
  @ApiResponse({ status: 409, description: 'BIZ_MENTORSHIP_DUPLICATE_PROPOSAL / BIZ_MENTORSHIP_PROPOSAL_NOT_PENDING' })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_MENTORSHIP_INELIGIBLE (details.failedChecks) / BIZ_MENTORSHIP_OVERRIDE_REQUIRED / BIZ_MENTORSHIP_OVERRIDE_UNNECESSARY',
  })
  create(@Body() dto: CoordinatorCreateProposalDto, @Actor() actor: MentorshipActor) {
    return this.coordinator.create(dto, actor);
  }

  @Get('proposals')
  @ApiOperation({ summary: 'Search proposals' })
  list(@Query() query: CoordinatorQueryProposalsDto) {
    return this.coordinator.list(query);
  }

  @Get('proposals/:id')
  @ApiOperation({ summary: 'Get a proposal including overrides and reason history' })
  @ApiResponse({ status: 404, description: 'RES_MENTORSHIP_PROPOSAL_NOT_FOUND' })
  get(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.proposals.getForCoordinator(id);
  }

  @Patch('proposals/:id')
  @Idempotent()
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Adjust terms or expiry of a pending proposal',
    description:
      'A terms change bumps termsVersion, clears approvals and releases any capacity hold; participants must re-approve.',
  })
  @ApiResponse({ status: 409, description: 'BIZ_MENTORSHIP_PROPOSAL_NOT_PENDING / BIZ_MENTORSHIP_TERMS_STALE' })
  adjust(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: CoordinatorAdjustProposalDto,
    @Actor() actor: MentorshipActor,
  ) {
    return this.proposals.adjust(id, dto, actor);
  }

  @Post('proposals/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw an open proposal with a reason' })
  withdraw(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: CoordinatorWithdrawProposalDto,
    @Actor() actor: MentorshipActor,
  ) {
    return this.proposals.withdrawAsCoordinator(id, dto.reason, actor);
  }

  @Get('overrides')
  @ApiOperation({
    summary: 'Report of soft-check overrides',
    description: 'Paged proposals with overrides plus totals by check and coordinator.',
  })
  overrides(@Query() query: OverrideReportQueryDto) {
    return this.coordinator.overrideReport(query);
  }

  @Patch('profiles/:userId/eligibility')
  @ApiOperation({
    summary: 'Grant or revoke hard eligibility for a mentor or mentee',
    description: 'Revoking withdraws the user’s open proposals on that side.',
  })
  @ApiResponse({ status: 404, description: 'RES_MENTORSHIP_PROFILE_NOT_FOUND' })
  setEligibility(
    @Param('userId', new ParseObjectIdPipe()) userId: string,
    @Body() dto: SetEligibilityDto,
    @Actor() actor: MentorshipActor,
  ) {
    return this.profiles.setEligibility(userId, dto, actor);
  }
}
