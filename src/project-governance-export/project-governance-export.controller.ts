import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  RecordGovernanceEntryDto,
  RegisterGovernanceProjectDto,
  RequestExportDto,
  RevokeExportDto,
} from './dto/project-governance-export.dto';
import { ProjectGovernanceExportService } from './project-governance-export.service';
import { GovernanceActor } from './project-governance-export.types';

@ApiTags('Project Governance Export')
@ApiBearerAuth('access-token')
@ApiParam({
  name: 'tenantId',
  description: 'Tenant that owns the project data',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT)
@Controller('governance-export/tenants/:tenantId')
export class ProjectGovernanceExportController {
  constructor(private readonly service: ProjectGovernanceExportService) {}

  @Post('projects')
  @ApiOperation({
    summary:
      'Register a project membership stub for governance export (CAPSTONE-056)',
    description:
      'Platform admins/moderators create it; afterwards only project owners (or admins) may replace it.',
  })
  @ApiResponse({ status: 201, description: 'Project registered' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  registerProject(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() body: RegisterGovernanceProjectDto,
  ) {
    this.service.registerProject(this.actor(tenantId, user), tenantId, {
      id: body.projectId,
      tenantId,
      members: body.members ?? {},
    });
    return { projectId: body.projectId, tenantId };
  }

  @Post('projects/:projectId/records')
  @ApiOperation({
    summary:
      'Append an accepted-terms, amendment or approval record (CAPSTONE-056)',
    description:
      'Project owners and platform admins only. Amendments must target accepted terms; approvals must target terms or an amendment.',
  })
  @ApiParam({ name: 'projectId' })
  @ApiResponse({ status: 201, description: 'Record appended' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 404, description: 'RES_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description: 'BIZ_GOVERNANCE_RECORD_DUPLICATE | BIZ_IDEMPOTENCY_KEY_REUSED',
  })
  @ApiResponse({ status: 422, description: 'BIZ_GOVERNANCE_TARGET_MISSING' })
  recordEntry(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: RecordGovernanceEntryDto,
  ) {
    return this.service.recordEntry(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      dto,
    );
  }

  @Post('projects/:projectId/exports')
  @ApiOperation({
    summary: 'Generate a participant-safe governance export (CAPSTONE-056)',
    description:
      'Any project member or platform admin. Snapshot of accepted terms, amendments, approvals, membership counts, ' +
      'and milestone/financial summaries. Retained 24h. Sections whose source fails are marked unavailable and the export is flagged partial.',
  })
  @ApiParam({ name: 'projectId' })
  @ApiResponse({
    status: 201,
    description: 'Export generated (metadata only; download via GET)',
  })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 409, description: 'BIZ_IDEMPOTENCY_KEY_REUSED' })
  @ApiResponse({ status: 422, description: 'BIZ_GOVERNANCE_EXPORT_LIMIT' })
  requestExport(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: RequestExportDto,
  ) {
    return this.service.requestExport(
      this.actor(tenantId, user),
      tenantId,
      projectId,
      dto,
    );
  }

  @Get('exports/:exportId')
  @ApiOperation({
    summary: 'Download a governance export (requester or platform admin)',
  })
  @ApiParam({ name: 'exportId' })
  @ApiResponse({
    status: 200,
    description: 'Export content, or metadata only if revoked',
  })
  @ApiResponse({ status: 404, description: 'RES_GOVERNANCE_EXPORT_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'BIZ_GOVERNANCE_EXPORT_EXPIRED' })
  getExport(
    @Param('tenantId') tenantId: string,
    @Param('exportId') exportId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getExport(
      this.actor(tenantId, user),
      tenantId,
      exportId,
    );
  }

  @Post('exports/:exportId/revocations')
  @ApiOperation({ summary: 'Revoke an export and discard its content' })
  @ApiParam({ name: 'exportId' })
  @ApiResponse({ status: 404, description: 'RES_GOVERNANCE_EXPORT_NOT_FOUND' })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_GOVERNANCE_EXPORT_INVALID_TRANSITION | BIZ_GOVERNANCE_EXPORT_EXPIRED',
  })
  revokeExport(
    @Param('tenantId') tenantId: string,
    @Param('exportId') exportId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: RevokeExportDto,
  ) {
    return this.service.revokeExport(
      this.actor(tenantId, user),
      tenantId,
      exportId,
      dto,
    );
  }

  @Get('audit')
  @ApiOperation({
    summary: 'Read governance export audit metadata (admin/moderator)',
  })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  audit(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getAudit(this.actor(tenantId, user), tenantId);
  }

  private actor(
    tenantId: string,
    user: Record<string, unknown> | undefined,
  ): GovernanceActor | undefined {
    if (!user) return undefined;
    return {
      actorId: typeof user['sub'] === 'string' ? user['sub'] : '',
      tenantId,
      roles: typeof user['role'] === 'string' ? [user['role']] : [],
    };
  }
}
