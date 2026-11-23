import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { MentorshipCtx, MentorshipRequestContext } from '../shared/mentorship-context';
import { ConflictService } from './conflict.service';
import {
  DecideWaiverDto,
  RequestWaiverDto,
  RunConflictCheckDto,
} from './dto/conflict.dto';

@ApiTags('Mentorship Conflicts (MENTOR-040)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/conflicts')
export class ConflictController {
  constructor(private readonly service: ConflictService) {}

  @Post('checks')
  @ApiOperation({
    summary: 'Run a versioned conflict check (participants or staff)',
    description: 'Identical retries return the same immutable check; private text is separated from public findings.',
  })
  @ApiOkResponse({ description: 'The recorded check and its explainable findings.' })
  @ApiForbiddenResponse({ description: 'MENTOR_ACCESS_DENIED' })
  runCheck(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Body() dto: RunConflictCheckDto,
  ) {
    return this.service.runCheck(ctx, dto);
  }

  @Get('checks/:id/explanation')
  @ApiOperation({
    summary: 'Explain a check to an authorized actor',
    description: 'Participants see only public codes/messages; private notes are staff-only.',
  })
  @ApiOkResponse({ description: 'The explanation.' })
  @ApiForbiddenResponse({ description: 'MENTOR_ACCESS_DENIED' })
  @ApiNotFoundResponse({ description: 'MENTOR_CONFLICT_CHECK_NOT_FOUND' })
  explain(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('id', new ParseObjectIdPipe()) id: string,
  ) {
    return this.service.explain(ctx, id);
  }

  @Get('proposals/:proposalId/activation-readiness')
  @ApiOperation({
    summary: 'Check whether activation is blocked by a hard conflict',
    description: 'Hard findings block activation until every one has an approved, separately decided waiver.',
  })
  @ApiOkResponse({ description: 'Activation is allowed.' })
  @ApiConflictResponse({ description: 'MENTOR_CONFLICT_OF_INTEREST' })
  @ApiNotFoundResponse({ description: 'MENTOR_COI_DECLARATION_REQUIRED' })
  activationReadiness(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('proposalId', new ParseObjectIdPipe()) proposalId: string,
  ) {
    return this.service.assertActivatable(ctx, proposalId);
  }

  @Post('waivers/request')
  @ApiOperation({ summary: 'Request a waiver for one hard finding' })
  @ApiOkResponse({ description: 'The appended waiver request (idempotent on retry).' })
  @ApiForbiddenResponse({ description: 'MENTOR_ACCESS_DENIED' })
  requestWaiver(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Body() dto: RequestWaiverDto,
  ) {
    return this.service.requestWaiver(ctx, dto);
  }

  @Post('waivers/:proposalId/:findingCode/decide')
  @ApiOperation({
    summary: 'Approve or reject a waiver — staff only, never the requester',
    description: 'The decision is appended as a new version; the request remains immutable.',
  })
  @ApiOkResponse({ description: 'The appended decision version.' })
  @ApiForbiddenResponse({ description: 'MENTOR_ACCESS_DENIED' })
  @ApiConflictResponse({ description: 'MENTOR_STALE_VERSION / BIZ_SEPARATION_OF_DUTIES / BIZ_OVERRIDE_ALREADY_RESOLVED' })
  decideWaiver(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('proposalId', new ParseObjectIdPipe()) proposalId: string,
    @Param('findingCode') findingCode: string,
    @Body() dto: DecideWaiverDto,
  ) {
    return this.service.decideWaiver(ctx, proposalId, findingCode, dto);
  }
}
