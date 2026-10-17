import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
import { Role } from '../common/enums/role.enum';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { Idempotent } from '../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { CreateMatchProposalDto } from './dto/create-match-proposal.dto';
import {
  CreateBlockDto,
  ProfileKindQueryDto,
  UpsertMentorshipProfileDto,
} from './dto/mentorship-profile.dto';
import {
  ApproveProposalDto,
  RejectProposalDto,
} from './dto/proposal-decision.dto';
import { QueryProposalsDto } from './dto/query-proposals.dto';
import { MatchProposalService } from './match-proposal.service';
import { Actor, MentorshipAccessGuard } from './mentorship-access.guard';
import { MentorshipProfileService } from './mentorship-profile.service';
import type { MentorshipActor } from './mentorship.policy';

const IDEMPOTENCY_HEADER = {
  name: 'X-Idempotency-Key',
  required: true,
  description: 'Unique per logical request; retries with the same key replay the first response',
};

/** Participant-facing matching endpoints (mentors = tutors, mentees = students). */
@ApiTags('mentorship')
@ApiBearerAuth('access-token')
@ApiResponse({ status: 401, description: 'Missing or invalid access token' })
@ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
@Controller('mentorship')
@UseGuards(MentorshipAccessGuard)
@UseInterceptors(IdempotencyInterceptor)
@Roles(Role.STUDENT, Role.TUTOR)
export class MentorshipController {
  constructor(
    private readonly proposals: MatchProposalService,
    private readonly profiles: MentorshipProfileService,
  ) {}

  // ── Profiles ──────────────────────────────────────────────────────────────

  @Put('profiles/me')
  @ApiOperation({
    summary: 'Create or update your mentor or mentee profile',
    description:
      'Mentor profiles require the tutor role and start ineligible until a coordinator approves them. Mentee profiles require the student role.',
  })
  @ApiResponse({ status: 200, description: 'Profile saved' })
  upsertProfile(
    @Body() dto: UpsertMentorshipProfileDto,
    @Actor() actor: MentorshipActor,
  ) {
    return this.profiles.upsertOwn(dto, actor);
  }

  @Get('profiles/me')
  @ApiOperation({ summary: 'Get your mentor or mentee profile' })
  @ApiResponse({ status: 404, description: 'RES_MENTORSHIP_PROFILE_NOT_FOUND' })
  getProfile(@Query() query: ProfileKindQueryDto, @Actor() actor: MentorshipActor) {
    return this.profiles.getOwn(query.kind, actor);
  }

  // ── Blocks ────────────────────────────────────────────────────────────────

  @Post('blocks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Block a user from being matched with you',
    description:
      'Applies in both directions, cannot be overridden by coordinators, and withdraws any open proposals between you. Idempotent.',
  })
  block(@Body() dto: CreateBlockDto, @Actor() actor: MentorshipActor) {
    return this.profiles.block(dto, actor);
  }

  @Get('blocks')
  @ApiOperation({ summary: 'List users you have blocked' })
  listBlocks(@Actor() actor: MentorshipActor) {
    return this.profiles.listBlocks(actor);
  }

  @Delete('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a block (idempotent)' })
  unblock(
    @Param('userId', new ParseObjectIdPipe()) userId: string,
    @Actor() actor: MentorshipActor,
  ) {
    return this.profiles.unblock(userId, actor);
  }

  // ── Proposals ─────────────────────────────────────────────────────────────

  @Post('proposals')
  @Idempotent()
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Propose a mentor match that includes yourself',
    description:
      'Tutors propose as the mentor, students as the mentee. Hard eligibility, blocks and mentor preferences are checked.',
  })
  @ApiResponse({ status: 201, description: 'Proposal created' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT / VAL_IDEMPOTENCY_KEY_MISSING' })
  @ApiResponse({ status: 403, description: 'AUTH_MENTORSHIP_INITIATOR_MISMATCH' })
  @ApiResponse({ status: 409, description: 'BIZ_MENTORSHIP_DUPLICATE_PROPOSAL' })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_MENTORSHIP_INELIGIBLE / BIZ_MENTORSHIP_BLOCKED / BIZ_MENTORSHIP_OVERRIDE_REQUIRED',
  })
  createProposal(
    @Body() dto: CreateMatchProposalDto,
    @Actor() actor: MentorshipActor,
  ) {
    return this.proposals.createAsParticipant(dto, actor);
  }

  @Get('proposals')
  @ApiOperation({ summary: 'List proposals you participate in' })
  listProposals(@Query() query: QueryProposalsDto, @Actor() actor: MentorshipActor) {
    return this.proposals.listForParticipant(query, actor);
  }

  @Get('proposals/:id')
  @ApiOperation({ summary: 'Get a proposal you participate in' })
  @ApiResponse({ status: 404, description: 'RES_MENTORSHIP_PROPOSAL_NOT_FOUND' })
  getProposal(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Actor() actor: MentorshipActor,
  ) {
    return this.proposals.getForParticipant(id, actor);
  }

  @Post('proposals/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve the current terms',
    description:
      'Send the termsVersion (and ideally termsHash) you reviewed. When every required participant has approved the same terms, the engagement activates. Repeating an approval is safe.',
  })
  @ApiResponse({ status: 200, description: 'Approval recorded; status is pending or accepted' })
  @ApiResponse({
    status: 409,
    description:
      'BIZ_MENTORSHIP_TERMS_STALE / BIZ_MENTORSHIP_PROPOSAL_NOT_PENDING / BIZ_MENTORSHIP_CAPACITY_EXHAUSTED / BIZ_MENTORSHIP_ALREADY_ENGAGED',
  })
  @ApiResponse({ status: 422, description: 'BIZ_MENTORSHIP_PROPOSAL_EXPIRED / BIZ_MENTORSHIP_INELIGIBLE' })
  approve(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: ApproveProposalDto,
    @Actor() actor: MentorshipActor,
  ) {
    return this.proposals.approve(id, dto, actor);
  }

  @Post('proposals/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a proposal (releases any capacity hold)' })
  @ApiResponse({ status: 409, description: 'BIZ_MENTORSHIP_PROPOSAL_NOT_PENDING' })
  reject(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: RejectProposalDto,
    @Actor() actor: MentorshipActor,
  ) {
    return this.proposals.reject(id, dto, actor);
  }

  @Post('proposals/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw a proposal you initiated' })
  withdraw(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Actor() actor: MentorshipActor,
  ) {
    return this.proposals.withdrawAsParticipant(id, actor);
  }

  // ── Engagements ───────────────────────────────────────────────────────────

  @Get('engagements')
  @ApiOperation({ summary: 'List your activated mentorship engagements' })
  listEngagements(@Actor() actor: MentorshipActor) {
    return this.proposals.listEngagements(actor);
  }
}
