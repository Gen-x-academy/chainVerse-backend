import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrganizationMemberService } from './organization-member.service';
import { CreateOrganizationMemberDto } from './dto/create-organization-member.dto';
import { UpdateOrganizationMemberDto } from './dto/update-organization-member.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import type { ResolvedOrgMembership } from '../common/guards/organization-roles.guard';
import { OrganizationRole } from '../common/enums/organization-role.enum';
import { Role } from '../common/enums/role.enum';
import { OrgRoles, OrgScope } from '../common/decorators/org-roles.decorator';
import { OrgMembership } from '../common/decorators/org-membership.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditActor } from '../common/audit/audit-context';
import type { AuditContext } from '../common/audit/audit-context';
import { FindOrganizationMembersDto } from './dto/find-organization-members.dto';

@ApiBearerAuth('access-token')
@ApiTags('Organization Members')
@Controller('organization-members')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
export class OrganizationMemberController {
  constructor(private readonly service: OrganizationMemberService) {}

  @Get('organization/:orgId')
  @ApiOperation({ summary: 'List members of an organization (members only)' })
  @OrgScope({ source: 'param', key: 'orgId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  findByOrganization(
    @Param('orgId') orgId: string,
    @Query() paginationDto: FindOrganizationMembersDto,
  ) {
    return this.service.findByOrganization(orgId, paginationDto);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'List your own organization memberships' })
  findByUser(
    @Param('userId') userId: string,
    @CurrentUser('sub') requesterId: string,
    @CurrentUser('role') requesterRole: string,
    @Query() paginationDto: FindOrganizationMembersDto,
  ) {
    return this.service.findByUser(
      userId,
      requesterId,
      requesterRole === Role.ADMIN,
      paginationDto,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a membership (members of the same org only)' })
  @OrgScope({ source: 'membershipParam', key: 'id' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a member (organization owner or admin)' })
  @OrgScope({ source: 'body', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  addMember(
    @Body() payload: CreateOrganizationMemberDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.addMember(payload, audit);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change a member role (organization owner or admin)',
  })
  @OrgScope({ source: 'membershipParam', key: 'id' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  updateRole(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateOrganizationMemberDto,
    @OrgMembership() membership: ResolvedOrgMembership,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.updateRole(id, payload, membership?.role, audit);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a member (organization owner or admin)' })
  @OrgScope({ source: 'membershipParam', key: 'id' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  removeMember(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @OrgMembership() membership: ResolvedOrgMembership,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.removeMember(id, membership?.role, audit);
  }
}
