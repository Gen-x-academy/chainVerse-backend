import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { OrgRoles, OrgScope } from '../common/decorators/org-roles.decorator';
import { OrganizationRole } from '../common/enums/organization-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ScholarshipReviewerDashboardService } from './scholarship-reviewer-dashboard.service';
import {
  ReviewerAssignmentQueryDto,
  ReviewerDashboardQueryDto,
} from './dto/reviewer-dashboard.dto';

/**
 * Reviewer-facing scholarship dashboard.
 *
 * Handlers automatically scope to `req.user.sub` as the reviewer identity —
 * a reviewer cannot query another reviewer's assignments.
 *
 * Organisation membership (INSTRUCTOR or above) is enforced by
 * OrganizationRolesGuard.  Blind-review identity stripping is handled in the
 * service layer.
 *
 * Operational impact:
 *   All handlers are read-only aggregations; no mutations occur here.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarship — Reviewer Dashboard')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/reviewer-dashboard')
export class ScholarshipReviewerDashboardController {
  constructor(private readonly svc: ScholarshipReviewerDashboardService) {}

  // ── Snapshot ──────────────────────────────────────────────────────────────

  @Get('snapshot')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Reviewer dashboard snapshot — workload, pending, overdue, and conflicts',
  })
  @ApiResponse({ status: 200, description: 'Live snapshot returned' })
  getSnapshot(
    @CurrentUser('sub') reviewerId: string,
    @Query() query: ReviewerDashboardQueryDto,
  ) {
    return this.svc.getSnapshot(reviewerId, query.organizationId);
  }

  // ── Workload ──────────────────────────────────────────────────────────────

  @Get('workload')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({ summary: 'Reviewer workload counts (assigned / pending / completed)' })
  @ApiResponse({ status: 200, description: 'Workload counts returned' })
  getWorkload(
    @CurrentUser('sub') reviewerId: string,
    @Query() query: ReviewerDashboardQueryDto,
  ) {
    return this.svc.getWorkload(reviewerId, query.organizationId);
  }

  // ── Assignments ───────────────────────────────────────────────────────────

  @Get('assignments')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Paginated assignment work queue',
    description:
      'Returns the reviewer\'s assignments, respecting blind-review settings. ' +
      'Filter by `status` and `programId` to narrow the queue.',
  })
  @ApiResponse({ status: 200, description: 'Paginated assignment cards' })
  listAssignments(
    @CurrentUser('sub') reviewerId: string,
    @Query() query: ReviewerAssignmentQueryDto,
  ) {
    return this.svc.listAssignments(reviewerId, query);
  }

  @Get('assignments/:reviewId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({ summary: 'Get full review document for the review form' })
  @ApiResponse({ status: 404, description: 'Review not found or not owned by caller' })
  getReview(
    @CurrentUser('sub') reviewerId: string,
    @Param('reviewId', new ParseObjectIdPipe()) reviewId: string,
  ) {
    return this.svc.getReview(reviewerId, reviewId);
  }

  // ── Conflicts ─────────────────────────────────────────────────────────────

  @Get('conflicts')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Application IDs where the reviewer has a conflict of interest',
    description:
      'Advisory — the review submission guard enforces the block. ' +
      'UI should display a warning for any application in this list.',
  })
  @ApiResponse({ status: 200, description: 'Conflicted application ID array' })
  getConflicts(
    @CurrentUser('sub') reviewerId: string,
    @Query() query: ReviewerDashboardQueryDto,
  ) {
    return this.svc.getConflictedApplicationIds(
      reviewerId,
      query.organizationId,
    );
  }
}
