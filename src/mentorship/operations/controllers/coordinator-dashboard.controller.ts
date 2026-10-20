import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '../../../common/enums/role.enum';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Idempotent } from '../../../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../../../idempotency/idempotency.interceptor';
import { ValidationDomainException } from '../../../common/errors/domain.exception';
import { ErrorCode } from '../../../common/errors/error-codes.enum';
import { Actor, MentorshipAccessGuard } from '../../mentorship-access.guard';
import type { MentorshipActor } from '../../mentorship.policy';
import {
  AnalyticsExportQueryDto,
  CoordinatorDashboardQueryDto,
  CoordinatorQueueQueryDto,
  SaveDashboardFiltersDto,
} from '../dto/mentorship-operations-query.dto';
import { CreateInterventionDto } from '../dto/create-intervention.dto';
import { CoordinatorQueue, OpsJob } from '../enums/mentorship-operations.enums';
import { CoordinatorDashboardService } from '../services/coordinator-dashboard.service';
import { InterventionsService } from '../services/interventions.service';
import { MentorshipAnalyticsService } from '../services/mentorship-analytics.service';
import { MentorshipOpsWorkflowService } from '../services/mentorship-ops-workflow.service';

/**
 * Coordinator operations dashboard (MENTOR-116 / issue #1434).
 *
 * Deny-by-default: coordinators only (admin + moderator). Each aggregate
 * links to its queue endpoint, job-derived cards carry stale labelling,
 * filters persist per coordinator, and the export honors the tenant scope
 * (programId is mandatory).
 */
@ApiTags('Mentorship Coordinator')
@ApiBearerAuth('access-token')
@UseGuards(MentorshipAccessGuard)
@UseInterceptors(IdempotencyInterceptor)
@Roles(Role.ADMIN, Role.MODERATOR)
@Controller('mentorship/coordinator')
export class CoordinatorDashboardController {
  constructor(
    private readonly coordinator: CoordinatorDashboardService,
    private readonly interventions: InterventionsService,
    private readonly analytics: MentorshipAnalyticsService,
    private readonly workflow: MentorshipOpsWorkflowService,
  ) {}

  @ApiOperation({
    summary: 'Coordinator operations dashboard (MENTOR-116)',
    description:
      'Capacity, review queues, unmatched participants, expiring proposals ' +
      '(with sweeper backlog + stale flag), schedule risks, overdue milestones, ' +
      'disputes and recent interventions. Filters are resolved as: explicit ' +
      'query parameters > saved filters > defaults (reported in ' +
      'meta.filterSource).',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard cards with permissions, links and staleness',
  })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Get()
  dashboard(
    @Actor() actor: MentorshipActor,
    @Query() query: CoordinatorDashboardQueryDto,
  ) {
    return this.coordinator.dashboard(actor, query);
  }

  @ApiOperation({
    summary: 'List the matching records behind a dashboard aggregate',
    description:
      'Supported queues: eligibility_review, expiring_proposals, ' +
      'unmatched_participants, schedule_risks, overdue_milestones, disputes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated queue items linked from the dashboard',
  })
  @ApiResponse({
    status: 400,
    description: 'VAL_INVALID_INPUT – unknown queue name',
  })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Get('queues/:queue')
  queue(
    @Param('queue') queue: string,
    @Query() query: CoordinatorQueueQueryDto,
  ) {
    const normalized = queue.replace(/-/g, '_') as CoordinatorQueue;
    if (!Object.values(CoordinatorQueue).includes(normalized)) {
      throw new ValidationDomainException(
        `Unknown queue "${queue}". Supported: ${Object.values(CoordinatorQueue).join(', ')}`,
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    return this.coordinator.queue(normalized, query);
  }

  @ApiOperation({ summary: 'Read my persisted dashboard filters' })
  @ApiResponse({ status: 200, description: 'Saved filters (or defaults)' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Get('filters')
  filters(@Actor() actor: MentorshipActor) {
    return this.coordinator.savedFilters(actor);
  }

  @ApiOperation({
    summary: 'Persist my dashboard filters',
    description:
      "Upserts the caller's coordinator filter document (idempotent by nature).",
  })
  @ApiResponse({ status: 200, description: 'Filters after upsert' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Put('filters')
  saveFilters(
    @Actor() actor: MentorshipActor,
    @Body() dto: SaveDashboardFiltersDto,
  ) {
    return this.coordinator.saveFilters(actor, dto);
  }

  @ApiOperation({
    summary: 'Perform a coordinator intervention (idempotent)',
    description:
      'contact_participant, extend_proposal_expiry, expire_proposal, ' +
      'escalate_dispute (moderator+admin) and resolve_dispute (admin only). ' +
      'Effects are replay-safe: a deterministic dedupe key means a lost ' +
      'response can never double-apply an expiry or resolution.',
  })
  @ApiResponse({
    status: 201,
    description: 'Intervention record (replayed=true when retried)',
  })
  @ApiResponse({
    status: 403,
    description:
      'AUTH_INSUFFICIENT_PERMISSIONS (including resolve as moderator)',
  })
  @ApiResponse({
    status: 404,
    description: 'RES_MENTORSHIP_PROPOSAL_NOT_FOUND / RES_NOT_FOUND',
  })
  @ApiResponse({
    status: 409,
    description:
      'BIZ_MENTORSHIP_PROPOSAL_NOT_PENDING / BIZ_MENTORSHIP_INVALID_TRANSITION',
  })
  @ApiResponse({ status: 422, description: 'VAL_MENTORSHIP_REASON_REQUIRED' })
  @Idempotent()
  @Post('interventions')
  intervene(
    @Actor() actor: MentorshipActor,
    @Body() dto: CreateInterventionDto,
  ) {
    return this.interventions.perform(actor, dto);
  }

  @ApiOperation({
    summary: 'Export coordinator analytics for one program (CSV or JSON)',
    description:
      'Delegates to the MENTOR-114 export with the program scope enforced ' +
      '(tenant boundary) and small-group suppression applied to every cell.',
  })
  @ApiResponse({ status: 200, description: 'File download' })
  @ApiResponse({
    status: 400,
    description: 'VAL_INVALID_INPUT – programId is required',
  })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Get('export')
  async export(@Query() query: AnalyticsExportQueryDto, @Res() res: Response) {
    const file = await this.analytics.exportData(query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.body);
  }

  @ApiOperation({
    summary: 'Manually run a background ops job (administrator only)',
    description:
      'Runs expire_proposals, milestone_reminders or schedule_risk_sweep ' +
      'immediately (e.g. recovery after an outage). The run is recorded in ' +
      'the job-run ledger and every effect stays idempotent.',
  })
  @ApiResponse({ status: 201, description: 'Job summary counters' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT – unknown job' })
  @ApiResponse({
    status: 403,
    description: 'AUTH_INSUFFICIENT_PERMISSIONS (moderators included)',
  })
  @Roles(Role.ADMIN)
  @Post('jobs/:job/run')
  runJob(@Param('job') job: string) {
    if (!Object.values(OpsJob).includes(job as OpsJob)) {
      throw new ValidationDomainException(
        `Unknown job "${job}". Supported: ${Object.values(OpsJob).join(', ')}`,
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    return this.workflow.runJob(job as OpsJob);
  }
}
