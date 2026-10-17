import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JoiValidationPipe } from '../shared/joi-validation.pipe';
import { MentorshipAuthGuard } from '../shared/mentorship-auth.guard';
import { MentorshipCtx, MentorshipRequestContext } from '../shared/mentorship-context';
import { MentorshipPolicy, STAFF_ROLES } from '../shared/mentorship-policy.decorator';
import { MentorshipReviewQueueService } from './mentorship-review-queue.service';
import {
  AssignDto,
  assignSchema,
  ConflictDeclarationDto,
  conflictDeclarationSchema,
  DecisionDto,
  decisionSchema,
  QueueQueryDto,
  queueQuerySchema,
  TriageDto,
  triageSchema,
  UnassignDto,
  unassignSchema,
  workloadQuerySchema,
} from './dto/review-queue.dto';

/**
 * MENTOR-034 – scoped reviewer queues.
 *
 * All mutations take `expectedVersion` (the application's `version` from the
 * queue row) and are safe to retry: repeating an action already in effect
 * returns `result: "noop"`.
 */
@ApiTags('Mentorship – Review queue')
@ApiBearerAuth('access-token')
@UseGuards(MentorshipAuthGuard)
@Controller('mentorship/review-queue')
export class MentorshipReviewQueueController {
  constructor(private readonly service: MentorshipReviewQueueService) {}

  @Get()
  @MentorshipPolicy('review_queue.list', STAFF_ROLES)
  @ApiOperation({
    summary: 'List applications in your review scope',
    description:
      'Only programs you own or are an active scoped reviewer of are visible (admins: all). Ordering is total ' +
      '(always tie-broken by id) and pagination is keyset-based; cursors are bound to the filters that issued them.',
  })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT | MENTOR_INVALID_CURSOR' })
  @ApiResponse({ status: 403, description: 'MENTOR_ACCESS_DENIED (programId outside your scope)' })
  list(@MentorshipCtx() ctx: MentorshipRequestContext, @Query(new JoiValidationPipe(queueQuerySchema)) q: QueueQueryDto) {
    return this.service.list(ctx, q);
  }

  @Get('workload')
  @MentorshipPolicy('review_queue.workload', STAFF_ROLES)
  @ApiOperation({ summary: 'Workload indicators (leads/owners see all reviewers, reviewers see themselves)' })
  workload(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Query(new JoiValidationPipe(workloadQuerySchema)) q: { programId: string },
  ) {
    return this.service.workload(ctx, q.programId);
  }

  @Post(':applicationId/assignment')
  @HttpCode(200)
  @MentorshipPolicy('review_queue.assign', STAFF_ROLES)
  @ApiOperation({ summary: 'Claim (omit assigneeId) or assign/reassign an application' })
  @ApiBody({ type: AssignDto })
  @ApiResponse({ status: 409, description: 'MENTOR_ASSIGNMENT_CONFLICT | MENTOR_REVIEWER_AT_CAPACITY | MENTOR_CONFLICT_OF_INTEREST | MENTOR_ALREADY_DECIDED' })
  @ApiResponse({ status: 422, description: 'MENTOR_NOT_A_REVIEWER' })
  assign(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('applicationId') applicationId: string,
    @Body(new JoiValidationPipe(assignSchema)) dto: AssignDto,
  ) {
    return this.service.assign(ctx, applicationId, dto);
  }

  @Delete(':applicationId/assignment')
  @MentorshipPolicy('review_queue.unassign', STAFF_ROLES)
  @ApiOperation({ summary: 'Release an assignment (assignee, lead, owner or admin)' })
  @ApiBody({ type: UnassignDto })
  unassign(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('applicationId') applicationId: string,
    @Body(new JoiValidationPipe(unassignSchema)) dto: UnassignDto,
  ) {
    return this.service.unassign(ctx, applicationId, dto);
  }

  @Patch(':applicationId/triage')
  @MentorshipPolicy('review_queue.triage', STAFF_ROLES)
  @ApiOperation({ summary: 'Set priority and/or due date (lead, owner or admin)' })
  @ApiBody({ type: TriageDto })
  @ApiResponse({ status: 409, description: 'MENTOR_STALE_VERSION | MENTOR_ALREADY_DECIDED' })
  triage(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('applicationId') applicationId: string,
    @Body(new JoiValidationPipe(triageSchema)) dto: TriageDto,
  ) {
    return this.service.triage(ctx, applicationId, dto);
  }

  @Put(':applicationId/conflict-declaration')
  @MentorshipPolicy('review_queue.declare_conflict', STAFF_ROLES)
  @ApiOperation({
    summary: 'Declare whether you have a conflict of interest',
    description: 'Required (with hasConflict=false) before deciding. Declaring a conflict auto-releases your assignment.',
  })
  @ApiBody({ type: ConflictDeclarationDto })
  declareConflict(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('applicationId') applicationId: string,
    @Body(new JoiValidationPipe(conflictDeclarationSchema)) dto: ConflictDeclarationDto,
  ) {
    return this.service.declareConflict(ctx, applicationId, dto);
  }

  @Post(':applicationId/decision')
  @HttpCode(200)
  @MentorshipPolicy('review_queue.decide', STAFF_ROLES)
  @ApiOperation({ summary: 'Record a decision (assigned, conflict-cleared reviewer only)' })
  @ApiBody({ type: DecisionDto })
  @ApiResponse({ status: 403, description: 'MENTOR_NOT_ASSIGNEE | MENTOR_ACCESS_DENIED' })
  @ApiResponse({ status: 409, description: 'MENTOR_COI_DECLARATION_REQUIRED | MENTOR_CONFLICT_OF_INTEREST | MENTOR_ALREADY_DECIDED | MENTOR_STALE_VERSION' })
  decide(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('applicationId') applicationId: string,
    @Body(new JoiValidationPipe(decisionSchema)) dto: DecisionDto,
  ) {
    return this.service.decide(ctx, applicationId, dto);
  }

  @Get(':applicationId/audit')
  @MentorshipPolicy('review_queue.audit', STAFF_ROLES)
  @ApiOperation({ summary: 'Audit trail of queue actions for an application (lead, owner or admin)' })
  history(@MentorshipCtx() ctx: MentorshipRequestContext, @Param('applicationId') applicationId: string) {
    return this.service.history(ctx, applicationId);
  }
}
