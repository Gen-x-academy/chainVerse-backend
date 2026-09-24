import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../../common/guards/organization-roles.guard';
import {
  OrgRoles,
  OrgScope,
} from '../../common/decorators/org-roles.decorator';
import { OrganizationRole } from '../../common/enums/organization-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ScholarshipProgramsService } from '../services/scholarship-programs.service';
import { ScholarshipApplicationsService } from '../services/scholarship-applications.service';
import { CreateTermsVersionDto } from '../dto/program-terms.dto';
import {
  CreateScholarshipProgramDto,
  OrgScopedQueryDto,
  ScholarshipProgramQueryDto,
  TransitionProgramStatusDto,
  UpdateScholarshipProgramStatusDto,
} from '../dto/scholarship-program.dto';
import {
  ReviewScholarshipApplicationDto,
  ScholarshipApplicationQueryDto,
} from '../dto/scholarship-application.dto';

@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Programs')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/programs')
export class ScholarshipProgramsController {
  constructor(
    private readonly programsService: ScholarshipProgramsService,
    private readonly applicationsService: ScholarshipApplicationsService,
  ) {}

  @Post()
  @OrgScope({ source: 'body', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Create a scholarship program for an organization' })
  @ApiResponse({ status: 201, description: 'Program created in draft' })
  create(
    @Body() dto: CreateScholarshipProgramDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.programsService.createProgram(dto, actorId);
  }

  @Get()
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({ summary: 'List an organization's scholarship programs' })
  list(@Query() dto: ScholarshipProgramQueryDto) {
    return this.programsService.listPrograms(
      dto.organizationId,
      { status: dto.status },
      { page: dto.page, limit: dto.limit },
    );
  }

  @Get(':programId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({ summary: 'Get a scholarship program' })
  @ApiResponse({ status: 404, description: 'Program not found in this organization' })
  get(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
  ) {
    return this.programsService.getProgram(scope.organizationId, programId);
  }

  /**
   * Legacy status setter (no state-machine validation).
   * Retained for backward compatibility.  Prefer `PATCH :programId/transition`.
   */
  @Patch(':programId/status')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: '(Legacy) Directly set program status — no transition validation',
    deprecated: true,
  })
  setStatus(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
    @Body() dto: UpdateScholarshipProgramStatusDto,
  ) {
    return this.programsService.setProgramStatus(
      scope.organizationId,
      programId,
      dto.status,
    );
  }

  /**
   * Lifecycle transition endpoint (issue #1122).
   *
   * Enforces the program state machine:
   *   DRAFT → PUBLISHED → PAUSED → PUBLISHED → CLOSED → ARCHIVED
   *
   * Every successful transition is recorded in `statusHistory` with the
   * actor id and timestamp, providing a complete, append-only audit trail.
   *
   * Authorization:
   *   - Caller must be OWNER or ADMIN of the owning organization.
   *   - `organizationId` is passed via query string and verified by
   *     `OrganizationRolesGuard` before this handler is invoked.
   *
   * Operational impact:
   *   - Transitioning to ARCHIVED is irreversible — no further transitions
   *     are permitted.  The program and its applications remain queryable.
   *   - Transitioning to PAUSED or CLOSED prevents new applications from
   *     being submitted (PUBLISHED status required to accept applications).
   */
  @Patch(':programId/transition')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Transition a program to the next lifecycle state',
    description:
      'Legal transitions: DRAFT→PUBLISHED, PUBLISHED→PAUSED, ' +
      'PAUSED→PUBLISHED, PUBLISHED→CLOSED, CLOSED→ARCHIVED. ' +
      'Each transition is recorded in statusHistory.',
  })
  @ApiResponse({ status: 200, description: 'Transition applied' })
  @ApiResponse({
    status: 422,
    description: 'Invalid transition or program is archived',
  })
  @ApiResponse({ status: 404, description: 'Program not found in this organization' })
  transitionStatus(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
    @Body() dto: TransitionProgramStatusDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.programsService.transitionProgramStatus(
      scope.organizationId,
      programId,
      dto.status,
      actorId,
    );
  }

  @Post(':programId/terms')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Create a new draft terms revision' })
  @ApiResponse({ status: 201, description: 'Draft revision created' })
  createTerms(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
    @Body() dto: CreateTermsVersionDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.programsService.createTermsDraft(
      scope.organizationId,
      programId,
      dto,
      actorId,
    );
  }

  @Post(':programId/terms/:versionId/publish')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Publish a draft revision (supersedes the previous published one)',
  })
  @ApiResponse({ status: 201, description: 'Revision published' })
  @ApiResponse({ status: 409, description: 'Revision is not a draft' })
  publishTerms(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('versionId', new ParseObjectIdPipe()) versionId: string,
    @Query() scope: OrgScopedQueryDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.programsService.publishTerms(
      scope.organizationId,
      programId,
      versionId,
      actorId,
    );
  }

  @Get(':programId/terms')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({ summary: 'List all terms revisions (newest first)' })
  listTerms(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
  ) {
    return this.programsService.listTerms(scope.organizationId, programId);
  }

  @Get(':programId/terms/:versionId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({ summary: 'Retrieve an immutable terms revision' })
  @ApiResponse({ status: 404, description: 'Revision not found' })
  getTermsVersion(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('versionId', new ParseObjectIdPipe()) versionId: string,
    @Query() scope: OrgScopedQueryDto,
  ) {
    return this.programsService.getTermsVersion(
      scope.organizationId,
      programId,
      versionId,
    );
  }

  @Get(':programId/applications')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({ summary: 'List applications for a program' })
  listApplications(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() dto: ScholarshipApplicationQueryDto,
  ) {
    return this.applicationsService.listForProgram(
      dto.organizationId,
      programId,
      { status: dto.status },
      { page: dto.page, limit: dto.limit },
    );
  }

  @Patch(':programId/applications/:applicationId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({ summary: 'Approve or reject an application' })
  @ApiResponse({ status: 409, description: 'Application already decided' })
  reviewApplication(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: OrgScopedQueryDto,
    @Body() dto: ReviewScholarshipApplicationDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.applicationsService.review(
      scope.organizationId,
      applicationId,
      dto.decision,
      actorId,
      dto.reason,
    );
  }
}
