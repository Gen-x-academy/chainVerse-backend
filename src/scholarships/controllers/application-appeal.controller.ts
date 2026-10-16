import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
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
import { RequestWithOrgMembership } from '../../common/guards/organization-roles.guard';
import { ApplicationAppealService } from '../services/application-appeal.service';
import {
  AppealScopeQueryDto,
  AssignAppealDto,
  ListAppealsQueryDto,
  ResolveAppealDto,
  SubmitAppealDto,
  WithdrawAppealDto,
} from '../dto/application-appeal.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Applicant controller
// Routes owned by the authenticated applicant (ownership verified in service).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applicant-facing appeal endpoints.
 *
 * All routes are nested under a scholarship program so that
 * `OrganizationRolesGuard` can resolve the tenant from the query-string
 * `organizationId`.  The service performs a second, applicant-ownership check
 * on every write so that one authenticated user cannot manipulate another
 * applicant's appeals.
 *
 * Routes:
 *   POST   /scholarships/programs/:programId/applications/:applicationId/appeals
 *   GET    /scholarships/programs/:programId/applications/:applicationId/appeals
 *   GET    /scholarships/appeals/:appealId
 *   DELETE /scholarships/appeals/:appealId
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Applicant Appeals')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller()
export class ApplicantAppealController {
  constructor(private readonly appealService: ApplicationAppealService) {}

  // ── Submit ─────────────────────────────────────────────────────────────────

  /**
   * File a new appeal against a rejected scholarship decision.
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/appeals
   *
   * Eligibility:
   *   - The calling applicant must own the application.
   *   - The application must be in REJECTED status, or have a CommitteeDecision
   *     with outcome REJECTED.
   *   - At most one active appeal (PENDING or UNDER_REVIEW) per application.
   *
   * The service automatically:
   *   - Collects original reviewer ids and stores them in `excludedReviewerIds`.
   *   - Applies a default resolution deadline (30 days) when none is supplied.
   *   - Notifies organization staff (best-effort).
   *
   * Authorization: any authenticated user — the service enforces applicant
   * ownership via the JWT `sub`.
   */
  @Post(
    'scholarships/programs/:programId/applications/:applicationId/appeals',
  )
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({
    summary: 'File an appeal against a rejected scholarship decision',
    description:
      'Applicant submits an appeal with grounds, a statement, and optional ' +
      'evidence. Application must be REJECTED or have a REJECTED committee ' +
      'outcome. At most one active appeal per application at a time.',
  })
  @ApiResponse({ status: 201, description: 'Appeal submitted — AppealResult (applicant view).' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS — caller is not the applicant.' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'BIZ_APPEAL_ALREADY_ACTIVE — an active appeal exists.' })
  @ApiResponse({ status: 422, description: 'BIZ_APPEAL_NOT_ELIGIBLE — application not in an appealable state.' })
  submitAppeal(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: AppealScopeQueryDto,
    @Body() dto: SubmitAppealDto,
    @CurrentUser('sub') applicantId: string,
  ) {
    return this.appealService.submitAppeal(
      scope.organizationId,
      applicationId,
      applicantId,
      dto,
    );
  }

  // ── List own appeals for an application ───────────────────────────────────

  /**
   * List all appeals the applicant has filed for a specific application.
   *
   * GET /scholarships/programs/:programId/applications/:applicationId/appeals
   *
   * Returns the applicant-facing view (no reviewNotes, excludedReviewerIds,
   * or auditTrail).  Sorted by createdAt descending.
   *
   * Authorization: any authenticated user — the service enforces that the
   * caller is the application owner.
   */
  @Get(
    'scholarships/programs/:programId/applications/:applicationId/appeals',
  )
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({
    summary: "List an applicant's appeals for an application",
    description:
      'Returns all appeals filed by the calling applicant for the given ' +
      'application. Staff-only fields are omitted. Sorted newest-first.',
  })
  @ApiResponse({ status: 200, description: 'Array of AppealResult (applicant view).' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS — caller is not the applicant.' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND' })
  listOwnAppeals(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: AppealScopeQueryDto,
    @CurrentUser('sub') applicantId: string,
  ) {
    return this.appealService.listAppealsForApplicant(
      scope.organizationId,
      applicationId,
      applicantId,
    );
  }

  // ── Get single appeal (applicant view) ────────────────────────────────────

  /**
   * Get a single appeal by id (applicant-facing view).
   *
   * GET /scholarships/appeals/:appealId
   *
   * Staff-only fields (`reviewNotes`, `excludedReviewerIds`, `auditTrail`)
   * are stripped from the response.
   *
   * Authorization: any authenticated user — the service enforces that the
   * caller is the applicant who filed the appeal.
   */
  @Get('scholarships/appeals/:appealId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({
    summary: 'Get an appeal by id (applicant view)',
    description:
      'Returns a single appeal. Staff-only fields are omitted. ' +
      'The service verifies the caller is the applicant who filed the appeal.',
  })
  @ApiResponse({ status: 200, description: 'AppealResult (applicant view).' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 404, description: 'RES_APPEAL_NOT_FOUND' })
  getOwnAppeal(
    @Param('appealId', new ParseObjectIdPipe()) appealId: string,
    @Query() scope: AppealScopeQueryDto,
    @CurrentUser('sub') applicantId: string,
  ) {
    return this.appealService.getAppealForApplicant(
      scope.organizationId,
      appealId,
      applicantId,
    );
  }

  // ── Withdraw ───────────────────────────────────────────────────────────────

  /**
   * Withdraw an active appeal.
   *
   * DELETE /scholarships/appeals/:appealId
   *
   * Transitions status to WITHDRAWN.  Only the applicant who filed the
   * appeal may withdraw it.  Allowed from PENDING or UNDER_REVIEW status.
   *
   * Authorization: any authenticated user — the service enforces ownership.
   */
  @Delete('scholarships/appeals/:appealId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({
    summary: 'Withdraw an active appeal (applicant only)',
    description:
      'Transitions appeal status to WITHDRAWN. ' +
      'Only the applicant who filed the appeal may withdraw it. ' +
      'Appeal must be in PENDING or UNDER_REVIEW status.',
  })
  @ApiResponse({ status: 200, description: 'Withdrawn AppealResult (applicant view).' })
  @ApiResponse({ status: 403, description: 'BIZ_APPEAL_WITHDRAW_FORBIDDEN — caller is not the applicant.' })
  @ApiResponse({ status: 404, description: 'RES_APPEAL_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'BIZ_APPEAL_INVALID_STATE — appeal is already in a terminal state.' })
  withdrawAppeal(
    @Param('appealId', new ParseObjectIdPipe()) appealId: string,
    @Query() scope: AppealScopeQueryDto,
    @Body() dto: WithdrawAppealDto,
    @CurrentUser('sub') applicantId: string,
  ) {
    return this.appealService.withdrawAppeal(
      scope.organizationId,
      appealId,
      applicantId,
      dto,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff controller
// Routes restricted to OWNER / ADMIN organization roles.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Staff-facing appeal management endpoints (OWNER / ADMIN only).
 *
 * Routes:
 *   GET   /scholarships/programs/:programId/appeals
 *   GET   /scholarships/programs/:programId/applications/:applicationId/appeals/staff
 *   GET   /scholarships/programs/:programId/appeals/:appealId
 *   PATCH /scholarships/programs/:programId/appeals/:appealId/assign
 *   PATCH /scholarships/programs/:programId/appeals/:appealId/resolve
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Staff Appeal Management')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller()
export class StaffAppealController {
  constructor(private readonly appealService: ApplicationAppealService) {}

  // ── List appeals for a program ─────────────────────────────────────────────

  /**
   * List all appeals across a scholarship program.
   *
   * GET /scholarships/programs/:programId/appeals
   *
   * Optional query filters: `status`, `grounds`.
   * Returns the full staff view including `reviewNotes`, `excludedReviewerIds`,
   * and `auditTrail`.
   *
   * Authorization: OWNER or ADMIN of the organization.
   */
  @Get('scholarships/programs/:programId/appeals')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'List all appeals for a scholarship program (staff)',
    description:
      'Returns all appeals across the program. Optional ?status and ' +
      '?grounds filters. Sorted by createdAt descending. Full staff view.',
  })
  @ApiResponse({ status: 200, description: 'Array of AppealResult (staff view).' })
  listProgramAppeals(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() query: ListAppealsQueryDto,
  ) {
    return this.appealService.listAppealsForProgram(
      query.organizationId,
      programId,
      query,
    );
  }

  // ── List appeals for a specific application ────────────────────────────────

  /**
   * List all appeals for a specific application (staff view).
   *
   * GET /scholarships/programs/:programId/applications/:applicationId/appeals/staff
   *
   * Returns the full staff view.
   *
   * Authorization: OWNER or ADMIN of the organization.
   */
  @Get(
    'scholarships/programs/:programId/applications/:applicationId/appeals/staff',
  )
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'List appeals for a specific application (staff)',
    description:
      'Returns all appeals filed against this application. ' +
      'Includes staff-only fields. Optional ?status and ?grounds filters.',
  })
  @ApiResponse({ status: 200, description: 'Array of AppealResult (staff view).' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND' })
  listApplicationAppeals(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() query: ListAppealsQueryDto,
  ) {
    return this.appealService.listAppealsForApplication(
      query.organizationId,
      applicationId,
      query,
    );
  }

  // ── Get single appeal (staff view) ────────────────────────────────────────

  /**
   * Get a single appeal by id (full staff view).
   *
   * GET /scholarships/programs/:programId/appeals/:appealId
   *
   * Returns the complete document including `reviewNotes`,
   * `excludedReviewerIds`, and `auditTrail`.
   *
   * Authorization: OWNER or ADMIN of the organization.
   */
  @Get('scholarships/programs/:programId/appeals/:appealId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Get a single appeal by id (staff view)',
    description:
      'Returns the full appeal document including staff-only fields: ' +
      'reviewNotes, excludedReviewerIds, and auditTrail.',
  })
  @ApiResponse({ status: 200, description: 'AppealResult (staff view).' })
  @ApiResponse({ status: 404, description: 'RES_APPEAL_NOT_FOUND' })
  getAppeal(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('appealId', new ParseObjectIdPipe()) appealId: string,
    @Query() scope: AppealScopeQueryDto,
  ) {
    return this.appealService.getAppeal(scope.organizationId, appealId);
  }

  // ── Assign reviewer ────────────────────────────────────────────────────────

  /**
   * Assign a reviewer to a PENDING appeal, transitioning it to UNDER_REVIEW.
   *
   * PATCH /scholarships/programs/:programId/appeals/:appealId/assign
   *
   * When `assignedReviewerId` is omitted the calling staff member is
   * self-assigned.  The reviewer must not be listed in the appeal's
   * `excludedReviewerIds` (original reviewers are barred).
   *
   * Authorization: OWNER or ADMIN of the organization.
   */
  @Patch('scholarships/programs/:programId/appeals/:appealId/assign')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Assign a reviewer to a pending appeal',
    description:
      'Transitions appeal from PENDING → UNDER_REVIEW. ' +
      'Omit assignedReviewerId to self-assign. ' +
      'The reviewer must not be an original reviewer (excludedReviewerIds). ' +
      'Applicant is notified (best-effort).',
  })
  @ApiResponse({ status: 200, description: 'Updated AppealResult (staff view).' })
  @ApiResponse({ status: 404, description: 'RES_APPEAL_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'BIZ_APPEAL_INVALID_STATE | BIZ_APPEAL_REVIEWER_EXCLUDED' })
  assignAppeal(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('appealId', new ParseObjectIdPipe()) appealId: string,
    @Query() scope: AppealScopeQueryDto,
    @Body() dto: AssignAppealDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.appealService.assignAppeal(
      scope.organizationId,
      appealId,
      actorId,
      dto,
    );
  }

  // ── Resolve appeal ─────────────────────────────────────────────────────────

  /**
   * Record the final decision on an appeal (UPHELD or DISMISSED).
   *
   * PATCH /scholarships/programs/:programId/appeals/:appealId/resolve
   *
   * Appeal must be in UNDER_REVIEW status.  `reason` is mandatory and
   * will be surfaced to the applicant in their notification.  `reviewNotes`
   * are stored but never returned to the applicant.
   *
   * When UPHELD the linked application is transitioned back to UNDER_REVIEW
   * so a fresh, unbiased review round can be opened with non-excluded
   * reviewers.
   *
   * Authorization: OWNER or ADMIN of the organization.
   */
  @Patch('scholarships/programs/:programId/appeals/:appealId/resolve')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Resolve an appeal as UPHELD or DISMISSED (staff)',
    description:
      'Transitions appeal to UPHELD or DISMISSED. ' +
      'Appeal must be in UNDER_REVIEW status. ' +
      '`reason` is mandatory and shown to the applicant. ' +
      '`reviewNotes` are internal-only. ' +
      'UPHELD: application returns to UNDER_REVIEW for a fresh review round. ' +
      'DISMISSED: original decision stands. ' +
      'Applicant is notified (best-effort).',
  })
  @ApiResponse({ status: 200, description: 'Resolved AppealResult (staff view).' })
  @ApiResponse({ status: 404, description: 'RES_APPEAL_NOT_FOUND' })
  @ApiResponse({
    status: 422,
    description: 'BIZ_APPEAL_INVALID_STATE | BIZ_APPEAL_RESOLUTION_INVALID',
  })
  resolveAppeal(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('appealId', new ParseObjectIdPipe()) appealId: string,
    @Query() scope: AppealScopeQueryDto,
    @Body() dto: ResolveAppealDto,
    @CurrentUser('sub') actorId: string,
    @Req() req: RequestWithOrgMembership,
  ) {
    const actorDisplayName = req.organizationMembership?.role ?? actorId;
    return this.appealService.resolveAppeal(
      scope.organizationId,
      appealId,
      actorId,
      actorDisplayName,
      dto,
    );
  }
}
