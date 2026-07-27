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
  UseGuards,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { OrganizationRole } from '../common/enums/organization-role.enum';
import { OrgRoles, OrgScope } from '../common/decorators/org-roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditActor } from '../common/audit/audit-context';
import type { AuditContext } from '../common/audit/audit-context';

@ApiBearerAuth('access-token')
@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List organizations (public directory)' })
  findAll() {
    return this.service.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get an organization profile (public)' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  /**
   * Creating an organization needs no prior membership — the creator is
   * enrolled as its `owner`, which is what every later org-scoped check reads.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create an organization (creator becomes owner)' })
  create(
    @Body() payload: CreateOrganizationDto,
    @CurrentUser('sub') creatorId: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.create(payload, creatorId, audit);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, OrganizationRolesGuard)
  @OrgScope({ source: 'param', key: 'id' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Update an organization (owner or org admin)' })
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateOrganizationDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.update(id, payload, audit);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, OrganizationRolesGuard)
  @OrgScope({ source: 'param', key: 'id' })
  @OrgRoles(OrganizationRole.OWNER)
  @ApiOperation({ summary: 'Delete an organization (owner only)' })
  remove(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.remove(id, audit);
  }
}
