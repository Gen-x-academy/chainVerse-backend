import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Actor } from './actor.decorator';
import {
  AggregateOutcomesDto,
  RegisterProposalDto,
  RequestRevisionDto,
  RespondToRevisionDto,
  ReviewDeliverableDto,
  SubmitDeliverableDto,
  SubmitReviewDto,
} from './dto/review-outcomes.dto';
import { ReviewOutcomesAccessGuard } from './review-outcomes-access.guard';
import { ReviewOutcomesService } from './review-outcomes.service';
import { ActorContext } from './review-outcomes.types';

@ApiTags('Review Outcomes and Milestones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ReviewOutcomesAccessGuard)
@Controller('review-outcomes')
export class ReviewOutcomesController {
  constructor(private readonly service: ReviewOutcomesService) {}

  @Post('proposals')
  @ApiOperation({ summary: 'Register a proposal version for review' })
  @ApiResponse({ status: 201, description: 'Proposal registered' })
  @ApiResponse({
    status: 400,
    description: 'DUPLICATE_CRITERIA | validation failure',
  })
  @ApiResponse({ status: 403, description: 'REVIEW_OUTCOMES_ROLE_DENIED' })
  registerProposal(
    @Actor() actor: ActorContext,
    @Body() dto: RegisterProposalDto,
  ) {
    return this.service.registerProposal(actor, dto);
  }

  @Post('proposals/:proposalId/reviews')
  @ApiOperation({
    summary: 'Submit a review against the current proposal version',
  })
  @ApiResponse({ status: 201, description: 'Review recorded' })
  @ApiResponse({
    status: 400,
    description: 'STALE_PROPOSAL_VERSION | CRITERIA_MISMATCH',
  })
  @ApiResponse({ status: 409, description: 'REVIEW_ALREADY_SUBMITTED' })
  submitReview(
    @Actor() actor: ActorContext,
    @Param('proposalId') proposalId: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.service.submitReview(actor, proposalId, dto);
  }

  @Post('proposals/:proposalId/outcomes')
  @ApiOperation({
    summary: 'Aggregate reviews with explicit quorum and calibration policy',
  })
  @ApiResponse({ status: 201, description: 'Explainable outcome computed' })
  @ApiResponse({
    status: 400,
    description: 'QUORUM_NOT_MET | validation failure',
  })
  @ApiResponse({ status: 403, description: 'REVIEW_OUTCOMES_ROLE_DENIED' })
  aggregateOutcomes(
    @Actor() actor: ActorContext,
    @Param('proposalId') proposalId: string,
    @Body() dto: AggregateOutcomesDto,
  ) {
    return this.service.aggregateOutcomes(actor, proposalId, dto);
  }

  @Post('proposals/:proposalId/revision-requests')
  @ApiOperation({ summary: 'Request revisions on an exact proposal version' })
  @ApiResponse({ status: 201, description: 'Revision request recorded' })
  @ApiResponse({
    status: 400,
    description: 'STALE_PROPOSAL_VERSION | REVISION_DEADLINE_PAST',
  })
  @ApiResponse({ status: 409, description: 'REVISION_ALREADY_PENDING' })
  requestRevision(
    @Actor() actor: ActorContext,
    @Param('proposalId') proposalId: string,
    @Body() dto: RequestRevisionDto,
  ) {
    return this.service.requestRevision(actor, proposalId, dto);
  }

  @Post('proposals/:proposalId/revision-requests/:revisionRequestId/responses')
  @ApiOperation({
    summary: 'Respond to a revision request with a new proposal version',
  })
  @ApiResponse({ status: 201, description: 'New version accepted for review' })
  @ApiResponse({
    status: 400,
    description: 'REVISION_DEADLINE_EXPIRED | INVALID_RESUBMISSION_VERSION',
  })
  respondToRevision(
    @Actor() actor: ActorContext,
    @Param('proposalId') proposalId: string,
    @Param('revisionRequestId') revisionRequestId: string,
    @Body() dto: RespondToRevisionDto,
  ) {
    return this.service.respondToRevision(
      actor,
      proposalId,
      revisionRequestId,
      dto,
    );
  }

  @Post('milestones/:milestoneId/deliverables')
  @ApiOperation({
    summary: 'Submit an immutable milestone deliverable version',
  })
  @ApiResponse({ status: 201, description: 'Deliverable version recorded' })
  @ApiResponse({
    status: 400,
    description: 'MILESTONE_MISMATCH | SUBMITTER_CANNOT_REVIEW',
  })
  submitDeliverable(
    @Actor() actor: ActorContext,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: SubmitDeliverableDto,
  ) {
    return this.service.submitDeliverable(actor, milestoneId, dto);
  }

  @Post('milestones/:milestoneId/deliverables/:deliverableId/reviews')
  @ApiOperation({
    summary: 'Accept, request changes on, or reject a deliverable version',
  })
  @ApiResponse({ status: 201, description: 'Deliverable decision recorded' })
  @ApiResponse({
    status: 400,
    description: 'DELIVERABLE_VERSION_NOT_CURRENT | RUBRIC_MISMATCH',
  })
  @ApiResponse({
    status: 403,
    description: 'SUBMITTER_CANNOT_REVIEW | REVIEWER_NOT_DESIGNATED',
  })
  reviewDeliverable(
    @Actor() actor: ActorContext,
    @Param('milestoneId') milestoneId: string,
    @Param('deliverableId') deliverableId: string,
    @Body() dto: ReviewDeliverableDto,
  ) {
    return this.service.reviewDeliverable(
      actor,
      milestoneId,
      deliverableId,
      dto,
    );
  }

  @Get('audit')
  @ApiOperation({ summary: 'List tenant audit metadata for review outcomes' })
  @ApiResponse({
    status: 200,
    description: 'Audit metadata without private payloads',
  })
  @ApiResponse({ status: 403, description: 'REVIEW_OUTCOMES_ROLE_DENIED' })
  listAudit(@Actor() actor: ActorContext) {
    return this.service.listAudit(actor);
  }
}
