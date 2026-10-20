import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '../../../common/enums/role.enum';
import { Roles } from '../../../common/decorators/roles.decorator';
import { MentorshipAccessGuard } from '../../mentorship-access.guard';
import {
  AnalyticsExportQueryDto,
  AnalyticsQueryDto,
} from '../dto/mentorship-operations-query.dto';
import { MentorshipAnalyticsService } from '../services/mentorship-analytics.service';

/**
 * Mentorship program analytics (MENTOR-114 / issue #1431).
 *
 * Deny-by-default: coordinators only (admin + moderator), enforced by
 * {@link MentorshipAccessGuard}. Every response carries metric definitions,
 * denominators, the reporting window, freshness labelling and the active
 * suppression threshold.
 */
@ApiTags('Mentorship Analytics')
@ApiBearerAuth('access-token')
@UseGuards(MentorshipAccessGuard)
@Roles(Role.ADMIN, Role.MODERATOR)
@Controller('mentorship/analytics')
export class MentorshipAnalyticsController {
  constructor(private readonly analytics: MentorshipAnalyticsService) {}

  @ApiOperation({
    summary: 'Analytics overview with shared metric definitions (MENTOR-114)',
    description:
      'Returns the resolved reporting window, scope, freshness of the background ' +
      'workflow feeds, the active small-group suppression threshold and the metric ' +
      'catalogue used by every other analytics endpoint.',
  })
  @ApiResponse({
    status: 200,
    description: 'Overview metadata and metric catalogue',
  })
  @ApiResponse({
    status: 400,
    description: 'VAL_INVALID_INPUT – malformed window bounds',
  })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Get('overview')
  overview(@Query() query: AnalyticsQueryDto) {
    return this.analytics.overview(query);
  }

  @ApiOperation({
    summary: 'Applications and eligibility funnel',
    description:
      'Applications received inside the window by status, review queue depth, ' +
      'SLA breaches, decision outcomes with acceptance/rejection rates and ' +
      'time-to-decision, plus submission-time eligibility outcome distribution.',
  })
  @ApiResponse({ status: 200, description: 'Funnel metrics with denominators' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Get('funnel')
  funnel(@Query() query: AnalyticsQueryDto) {
    return this.analytics.funnel(query);
  }

  @ApiOperation({
    summary: 'Matching, activation and retention metrics',
    description:
      'Proposal outcomes, activation rate, median hours from proposal to ' +
      'activation, retention of pre-window engagements and mentee tenure.',
  })
  @ApiResponse({
    status: 200,
    description: 'Engagement metrics with denominators',
  })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Get('engagement')
  engagement(@Query() query: AnalyticsQueryDto) {
    return this.analytics.engagement(query);
  }

  @ApiOperation({
    summary: 'Session attendance and completion metrics',
    description:
      'Sessions started inside the window by status, completion / attendance / ' +
      'no-show rates and median hours from activation to first session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session metrics with denominators',
  })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Get('sessions')
  sessions(@Query() query: AnalyticsQueryDto) {
    return this.analytics.sessions(query);
  }

  @ApiOperation({
    summary: 'Milestones, disputes, capacity and per-cohort breakdown',
    description:
      'Outcome metrics for the window plus a per-cohort segment where cohorts ' +
      'below the suppression threshold are masked (value=null, suppressed=true).',
  })
  @ApiResponse({
    status: 200,
    description: 'Outcome metrics with suppressed cohort rows',
  })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @Get('outcomes')
  outcomes(@Query() query: AnalyticsQueryDto) {
    return this.analytics.outcomes(query);
  }

  @ApiOperation({
    summary: 'Download analytics for one program (CSV or JSON)',
    description:
      'Exports are explicitly program-scoped (tenant boundary) and run every ' +
      'numeric cell through small-group suppression so an export can never ' +
      'reveal a cohort or segment below the configured threshold.',
  })
  @ApiResponse({
    status: 200,
    description: 'File download (text/csv or application/json)',
  })
  @ApiResponse({
    status: 400,
    description: 'VAL_INVALID_INPUT – missing programId or bad window',
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
}
