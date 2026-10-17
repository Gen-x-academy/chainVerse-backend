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
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ScholarshipSponsorDashboardService } from './scholarship-sponsor-dashboard.service';
import {
  ImpactReportQueryDto,
  ProgramSummaryQueryDto,
  SponsorDashboardQueryDto,
} from './dto/sponsor-dashboard.dto';

/**
 * Sponsor-facing scholarship dashboard.
 *
 * All routes require OWNER or ADMIN membership in the target organisation
 * (enforced by OrganizationRolesGuard via `?organizationId=`).
 *
 * Operational impact:
 *   - All handlers perform live aggregations; no data is mutated.
 *   - For high-traffic deployments, `GET /snapshot` and `GET /impact` should
 *     be cached at the application layer with a short TTL (≤ 5 min).
 *
 * Privacy:
 *   - No applicant identity is exposed — counts and amounts only.
 *   - `reconciliationWarning` flags divergence > 0.01 between ledger and
 *     reservation totals; escalate to the finance team if raised.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarship — Sponsor Dashboard')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/sponsor-dashboard')
export class ScholarshipSponsorDashboardController {
  constructor(private readonly svc: ScholarshipSponsorDashboardService) {}

  // ── Snapshot ──────────────────────────────────────────────────────────────

  @Get('snapshot')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Sponsor dashboard snapshot — all key figures' })
  @ApiResponse({ status: 200, description: 'Live snapshot returned' })
  getSnapshot(@Query() query: SponsorDashboardQueryDto) {
    return this.svc.getSnapshot(query.organizationId);
  }

  // ── Program Budgets ───────────────────────────────────────────────────────

  @Get('programs')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.INSTRUCTOR)
  @ApiOperation({ summary: 'Paginated per-program budget summaries' })
  @ApiResponse({ status: 200, description: 'Budget summary cards with commitment ratios' })
  listProgramBudgets(@Query() query: ProgramSummaryQueryDto) {
    return this.svc.listProgramBudgets(query.organizationId, query);
  }

  @Get('programs/:programId/budget')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.INSTRUCTOR)
  @ApiOperation({ summary: 'Budget summary for a single program' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  getProgramBudget(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() query: SponsorDashboardQueryDto,
  ) {
    return this.svc.getProgramBudget(query.organizationId, programId);
  }

  // ── Application Funnel ────────────────────────────────────────────────────

  @Get('programs/:programId/funnel')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.INSTRUCTOR)
  @ApiOperation({ summary: 'Application funnel counts and rates for a program' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  getApplicationFunnel(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() query: SponsorDashboardQueryDto,
  ) {
    return this.svc.getApplicationFunnel(query.organizationId, programId);
  }

  // ── Review Progress ───────────────────────────────────────────────────────

  @Get('programs/:programId/review-progress')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.INSTRUCTOR)
  @ApiOperation({ summary: 'Review-completion progress for a program' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  getReviewProgress(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() query: SponsorDashboardQueryDto,
  ) {
    return this.svc.getReviewProgress(query.organizationId, programId);
  }

  // ── Awards & Disbursements ────────────────────────────────────────────────

  @Get('awards')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Award and disbursement summary across all programs' })
  @ApiResponse({ status: 200, description: 'Totals with reconciliation flag' })
  getAwardSummary(@Query() query: SponsorDashboardQueryDto) {
    return this.svc.getAwardDisbursementSummary(query.organizationId);
  }

  @Get('programs/:programId/awards')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.INSTRUCTOR)
  @ApiOperation({ summary: 'Award and disbursement summary for a single program' })
  @ApiResponse({ status: 200, description: 'Per-program totals with reconciliation flag' })
  getProgramAwardSummary(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() query: SponsorDashboardQueryDto,
  ) {
    return this.svc.getAwardDisbursementSummary(query.organizationId, programId);
  }

  // ── Impact Report ─────────────────────────────────────────────────────────

  @Get('impact')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Impact indicator report for stakeholder export',
    description:
      'Aggregate counts across programmes in an optional date window. ' +
      'Large organisations should constrain the window with `from`/`to`.',
  })
  @ApiResponse({ status: 200, description: 'Impact report returned' })
  getImpactReport(@Query() query: ImpactReportQueryDto) {
    return this.svc.getImpactReport(query.organizationId, query);
  }
}
