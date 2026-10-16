import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditActor } from '../../common/audit/audit-context';
import type { AuditContext } from '../../common/audit/audit-context';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  OrgRoles,
  OrgScope,
} from '../../common/decorators/org-roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../../common/guards/organization-roles.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  DisableScholarshipAssetDto,
  ListScholarshipAssetsQueryDto,
  ProposeScholarshipAssetDto,
} from '../dto/scholarship-asset.dto';
import { ScholarshipAssetService } from '../services/scholarship-asset.service';
import { ALL_MEMBERS, STAFF } from './roles';

@ApiBearerAuth('access-token')
@ApiTags('Scholarship Disbursements')
@Controller('organizations/:organizationId/scholarships/assets')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@OrgScope({ source: 'param', key: 'organizationId' })
export class ScholarshipAssetController {
  constructor(private readonly assets: ScholarshipAssetService) {}

  @Post()
  @OrgRoles(...STAFF)
  @ApiOperation({
    summary: 'Propose a payout asset for a program (inert until approved)',
  })
  propose(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Body() dto: ProposeScholarshipAssetDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.assets.propose(organizationId, dto, audit);
  }

  @Post(':assetId/approve')
  @OrgRoles(...STAFF)
  @ApiOperation({
    summary: 'Approve a proposed asset (approver must differ from proposer)',
  })
  approve(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Param('assetId', new ParseObjectIdPipe()) assetId: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.assets.approve(organizationId, assetId, audit);
  }

  @Post(':assetId/disable')
  @OrgRoles(...STAFF)
  @ApiOperation({ summary: 'Disable an asset; due payments in it are skipped' })
  disable(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Param('assetId', new ParseObjectIdPipe()) assetId: string,
    @Body() dto: DisableScholarshipAssetDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.assets.disable(organizationId, assetId, dto.reason, audit);
  }

  @Get()
  @OrgRoles(...ALL_MEMBERS)
  @ApiOperation({
    summary: 'List payout assets configured for the organization',
  })
  list(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Query() query: ListScholarshipAssetsQueryDto,
  ) {
    return this.assets.list(organizationId, query);
  }

  @Get(':assetId/trustline')
  @OrgRoles(...ALL_MEMBERS)
  @ApiOperation({
    summary:
      "Check whether the caller's verified payout wallet can receive the asset, with guidance",
  })
  trustline(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Param('assetId', new ParseObjectIdPipe()) assetId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.assets.trustlineGuidance(organizationId, assetId, userId);
  }
}
