import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../../common/guards/organization-roles.guard';
import {
  OrgRoles,
  OrgScope,
} from '../../common/decorators/org-roles.decorator';
import { OrganizationRole } from '../../common/enums/organization-role.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateScholarshipAwardDto } from '../dto/create-scholarship-award.dto';
import { Actor } from '../scholarship-actor';
import type { ScholarshipActor } from '../scholarship-actor';
import { ScholarshipAwardService } from '../services/scholarship-award.service';

@ApiBearerAuth('access-token')
@ApiTags('Scholarships')
@Controller('organizations/:orgId/scholarships/awards')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@OrgScope({ source: 'param', key: 'orgId' })
export class ScholarshipAwardController {
  constructor(private readonly awards: ScholarshipAwardService) {}

  @Post()
  @ApiOperation({ summary: 'Create a scholarship award (org owner/admin)' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  create(
    @Param('orgId', new ParseObjectIdPipe()) orgId: string,
    @Body() dto: CreateScholarshipAwardDto,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.awards.create(orgId, dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'List awards of an organization (staff)' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  list(@Param('orgId', new ParseObjectIdPipe()) orgId: string) {
    return this.awards.findByOrganization(orgId);
  }

  @Get(':awardId')
  @ApiOperation({ summary: 'Get one award (staff)' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  findOne(
    @Param('orgId', new ParseObjectIdPipe()) orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
  ) {
    return this.awards.findOne(orgId, awardId);
  }
}
