import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../../common/guards/organization-roles.guard';
import { OrgRoles, OrgScope } from '../../common/decorators/org-roles.decorator';
import { OrganizationRole } from '../../common/enums/organization-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PrerequisiteExclusionService } from '../services/prerequisite-exclusion.service';
import { AddPrerequisiteDto, AddExclusionDto } from '../dto/prerequisite-exclusion.dto';
import { OrgScopedQueryDto } from '../dto/scholarship-program.dto';

@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Prerequisites & Exclusions')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/programs/:programId')
export class PrerequisiteExclusionController {
  constructor(private readonly service: PrerequisiteExclusionService) {}

  // ── Prerequisites ──────────────────────────────────────────────────────────

  @Post('prerequisites')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Add a prerequisite requirement to a program' })
  @ApiResponse({ status: 201, description: 'Prerequisite added' })
  @ApiResponse({ status: 409, description: 'Duplicate prerequisite' })
  addPrerequisite(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
    @Body() dto: AddPrerequisiteDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.service.addPrerequisite(scope.organizationId, programId, dto, actorId);
  }

  @Get('prerequisites')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({ summary: 'List all prerequisites for a program' })
  listPrerequisites(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
  ) {
    return this.service.listPrerequisites(scope.organizationId, programId);
  }

  @Delete('prerequisites/:prerequisiteId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Remove a prerequisite rule' })
  @ApiResponse({ status: 200, description: 'Prerequisite removed' })
  @ApiResponse({ status: 404, description: 'Prerequisite not found' })
  removePrerequisite(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('prerequisiteId', new ParseObjectIdPipe()) prerequisiteId: string,
    @Query() scope: OrgScopedQueryDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.service.removePrerequisite(
      scope.organizationId,
      programId,
      prerequisiteId,
      actorId,
    );
  }

  // ── Exclusions ─────────────────────────────────────────────────────────────

  @Post('exclusions')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Add an exclusion rule — uses stable reason codes for reproducible decisions',
  })
  @ApiResponse({ status: 201, description: 'Exclusion rule added' })
  @ApiResponse({ status: 409, description: 'Duplicate exclusion type' })
  addExclusion(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
    @Body() dto: AddExclusionDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.service.addExclusion(scope.organizationId, programId, dto, actorId);
  }

  @Get('exclusions')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({ summary: 'List all exclusion rules for a program' })
  listExclusions(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
  ) {
    return this.service.listExclusions(scope.organizationId, programId);
  }

  @Delete('exclusions/:exclusionId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Remove an exclusion rule' })
  @ApiResponse({ status: 404, description: 'Exclusion not found' })
  removeExclusion(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('exclusionId', new ParseObjectIdPipe()) exclusionId: string,
    @Query() scope: OrgScopedQueryDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.service.removeExclusion(
      scope.organizationId,
      programId,
      exclusionId,
      actorId,
    );
  }
}
