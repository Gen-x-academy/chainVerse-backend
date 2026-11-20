import {
  Body,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AssignReviewerDto,
  AuditViewDto,
  CreateProposalDto,
  CreateQueueDto,
  CreateRevisionCycleDto,
  CreateRubricDto,
  ProposalViewDto,
  QueueViewDto,
  ReviewerProposalViewDto,
  ReviewViewDto,
  RevisionCycleViewDto,
  RubricViewDto,
  SubmitReviewDto,
} from './dto/proposal-review.dto';
import { ProposalReviewService } from './proposal-review.service';
import { ReviewActor } from './proposal-review.types';

export const CurrentReviewActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ReviewActor => {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = (name: string): string => {
      const value = request.headers?.[name];
      if (Array.isArray(value)) return value[0] ?? '';
      return value ?? '';
    };
    return {
      tenantId: header('x-tenant-id'),
      actorId: header('x-actor-id'),
      roles: header('x-actor-roles')
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean),
    };
  },
);

@ApiTags('Proposal Review')
@ApiHeader({ name: 'x-tenant-id', required: true })
@ApiHeader({ name: 'x-actor-id', required: true })
@ApiHeader({ name: 'x-actor-roles', required: true })
@ApiResponse({
  status: 403,
  description: 'Actor is not permitted for this operation',
})
@ApiResponse({
  status: 404,
  description: 'Resource does not exist in the actor tenant',
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@Controller('proposal-review')
export class ProposalReviewController {
  constructor(private readonly service: ProposalReviewService) {}

  @Post('proposals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a proposal with its private applicant payload',
  })
  @ApiCreatedResponse({ type: ProposalViewDto })
  createProposal(
    @CurrentReviewActor() actor: ReviewActor,
    @Body() dto: CreateProposalDto,
  ): Promise<ProposalViewDto> {
    return this.service.createProposal(actor, dto);
  }

  @Post('rubrics')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a configurable rubric whose criterion weights total 100',
  })
  @ApiCreatedResponse({ type: RubricViewDto })
  createRubric(
    @CurrentReviewActor() actor: ReviewActor,
    @Body() dto: CreateRubricDto,
  ): Promise<RubricViewDto> {
    return this.service.createRubric(actor, dto);
  }

  @Get('rubrics/:rubricId')
  @ApiOperation({ summary: 'Read a rubric in the actor tenant' })
  @ApiOkResponse({ type: RubricViewDto })
  getRubric(
    @CurrentReviewActor() actor: ReviewActor,
    @Param('rubricId') rubricId: string,
  ): RubricViewDto {
    return this.service.getRubric(actor, rubricId);
  }

  @Post('queues')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an open or blinded review queue' })
  @ApiCreatedResponse({ type: QueueViewDto })
  createQueue(
    @CurrentReviewActor() actor: ReviewActor,
    @Body() dto: CreateQueueDto,
  ): Promise<QueueViewDto> {
    return this.service.createQueue(actor, dto);
  }

  @Get('queues')
  @ApiOperation({ summary: 'List queues visible in the actor tenant' })
  @ApiOkResponse({ type: [QueueViewDto] })
  listQueues(@CurrentReviewActor() actor: ReviewActor): QueueViewDto[] {
    return this.service.listQueues(actor);
  }

  @Post('queues/:queueId/assignments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign a role-eligible reviewer to a proposal in a queue',
  })
  @ApiCreatedResponse({ type: QueueViewDto })
  assignReviewer(
    @CurrentReviewActor() actor: ReviewActor,
    @Param('queueId') queueId: string,
    @Body() dto: AssignReviewerDto,
  ): Promise<QueueViewDto> {
    return this.service.assignReviewer(actor, { ...dto, queueId });
  }

  @Get('queues/:queueId/proposals')
  @ApiOperation({
    summary:
      'List reviewer-facing proposals with blind-mode identity stripping',
  })
  @ApiOkResponse({ type: [ReviewerProposalViewDto] })
  listQueueProposals(
    @CurrentReviewActor() actor: ReviewActor,
    @Param('queueId') queueId: string,
  ): ReviewerProposalViewDto[] {
    return this.service.listQueueProposals(actor, queueId);
  }

  @Post('revision-cycles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Open an explicit revision cycle for a second review',
  })
  @ApiCreatedResponse({ type: RevisionCycleViewDto })
  createRevisionCycle(
    @CurrentReviewActor() actor: ReviewActor,
    @Body() dto: CreateRevisionCycleDto,
  ): Promise<RevisionCycleViewDto> {
    return this.service.createRevisionCycle(actor, dto);
  }

  @Post('reviews')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record one independent scored review per proposal cycle',
  })
  @ApiCreatedResponse({ type: ReviewViewDto })
  submitReview(
    @CurrentReviewActor() actor: ReviewActor,
    @Body() dto: SubmitReviewDto,
  ): Promise<ReviewViewDto> {
    return this.service.submitReview(actor, dto);
  }

  @Get('reviews')
  @ApiOperation({
    summary: 'List non-private review metadata visible to the actor',
  })
  @ApiOkResponse({ type: [ReviewViewDto] })
  listReviews(@CurrentReviewActor() actor: ReviewActor): ReviewViewDto[] {
    return this.service.listReviews(actor);
  }

  @Get('audit')
  @ApiOperation({
    summary: 'List metadata-only audit entries for the actor tenant',
  })
  @ApiOkResponse({ type: [AuditViewDto] })
  listAudit(@CurrentReviewActor() actor: ReviewActor): AuditViewDto[] {
    return this.service.listAudit(actor);
  }
}
