import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrganizationInvitationService } from './organization-invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { OrganizationRole } from '../common/enums/organization-role.enum';
import { OrgRoles, OrgScope } from '../common/decorators/org-roles.decorator';
import { OrgMembership } from '../common/decorators/org-membership.decorator';
import type { ResolvedOrgMembership } from '../common/guards/organization-roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditActor } from '../common/audit/audit-context';
import type { AuditContext } from '../common/audit/audit-context';

@ApiBearerAuth('access-token')
@ApiTags('Organization Invitations')
@Controller('organization-invitations')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class OrganizationInvitationController {
  constructor(private readonly service: OrganizationInvitationService) {}

  @Post()
  @ApiOperation({ summary: 'Invite a user by email (org owner or admin)' })
  @OrgScope({ source: 'body', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser('sub') userId: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.create(dto, userId, audit);
  }

  @Post('accept')
  @ApiOperation({ summary: 'Accept an invitation by token' })
  accept(
    @Body() dto: AcceptInvitationDto,
    @CurrentUser('sub') userId: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.accept(dto.token, userId, audit);
  }

  @Get('organization/:orgId')
  @ApiOperation({
    summary: 'List invitations for an organization (members only)',
  })
  @OrgScope({ source: 'param', key: 'orgId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  findByOrganization(@Param('orgId', new ParseObjectIdPipe()) orgId: string) {
    return this.service.findByOrganization(orgId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a pending invitation (org owner or admin)' })
  @OrgScope({ source: 'param', key: 'id' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  revoke(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @OrgMembership() membership: ResolvedOrgMembership,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.revoke(id, membership?.role, audit);
  }
}
