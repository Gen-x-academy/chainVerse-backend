import {
  Body,
  Controller,
  Get,
  Param,
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
import { ScholarshipAwardService } from '../services/scholarship-award.service';
import {
  AcceptAwardDto,
  AwardScopeQueryDto,
  CreateAwardDto,
  DeclineAwardDto,
  ListAwardsQueryDto,
  RescindAwardDto,
} from '../dto/award.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Staff controller — org-scoped routes (OWNER / ADMIN)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Staff-facing scholarship award endpoints.
 *
 * Route structure:
 *
 *   Program-level:
 *     POST  /scholarships/programs/:programId/applications/:applicationId/award
 *           → Create a new award for an approved application  (OWNER | ADMIN)
 *     GET   /scholarships/programs/:programId/awards
 *           → List all awards for a program                   (OWNER | ADMIN)
 *     GET   /scholarships/programs/:programId/applications/:applicationId/award
 *           → Get the award for a specific application        (OWNER | ADMIN)
 *
 *   Award-level mutations (staff only):
 *     POST  /scholarships/awards/:awardId/rescind
 *           → Rescind an ACCEPTED award                       (OWNER only)
 *
 * Authorization model:
 *   - All routes require a valid JWT (`JwtAuthGuard`) and verified organization
 *     membership (`OrganizationRolesGuard`).
 *   - `organizationId` is always sourced from the query string so the guard
 *     verifies membership before any handler runs.
 *   - Creation and read are open to OWNER and ADMIN.
 *   - Rescission is restricted to OWNER only.
 *
 * Tenant isolation:
 *   The guard resolves `organizationId` from the query string and verifies
 *   membership.  The service performs a second ownership check on every query.
 *
 * Privacy:
 *   Award amounts, terms, milestones, and rescission details are internal
 *   financial data.  These endpoints must not be accessible to applicants.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Awards (Staff)')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/programs/:programId')
export class ScholarshipAwardController {
  constructor(private readonly awardService: ScholarshipAwardService) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  /**
   * Create a scholarship award for an approved application.
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/award
   *
   * Materializes the approved committee decision as a formal award record with
   * amount, currency, terms, milestones, and an acceptance deadline.
   *
   * Returns 409 BIZ_AWARD_ALREADY_EXISTS when a non-terminal award already
   * exists for this application.
   * Returns 422 BIZ_AWARD_CONFLICT when the applicant already holds another
   * active award within the same organization.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Post('applications/:applicationId/award')
  @OrgScope({ source: 'body', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Create a scholarship award for an approved application (OWNER | ADMIN)',
    description:
      'Materializes an approved award with amount, currency, prose terms, ' +
      'disbursement milestones, and an acceptance deadline.  ' +
      'Returns 409 if a non-terminal award already exists for this application.  ' +
      'Returns 422 BIZ_AWARD_CONFLICT if the applicant already holds an active ' +
      'award elsewhere in the organization.',
  })
  @ApiResponse({ status: 201, description: 'Award created — AwardResult' })
  @ApiResponse({
    status: 404,
    description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND | RES_BUDGET_RESERVATION_NOT_FOUND',
  })
  @ApiResponse({ status: 409, description: 'BIZ_AWARD_ALREADY_EXISTS' })
  @ApiResponse({
    status: 422,
    description: 'BIZ_AWARD_CONFLICT | VAL_AWARD_ACCEPTANCE_DEADLINE_PAST | VAL_AWARD_MILESTONE_DATE_INVALID',
  })
  createAward(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Body() dto: CreateAwardDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.awardService.createAward(programId, applicationId, dto, actorId);
  }

  // ── List ───────────────────────────────────────────────────────────────────

  /**
   * List all awards for a scholarship program.
   *
   * GET /scholarships/programs/:programId/awards
   *
   * Returns a paginated, `createdAt`-descending list of AwardResult objects.
   * Optional `status` query parameter narrows to a specific lifecycle state.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Get('awards')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'List all awards for a scholarship program (OWNER | ADMIN)',
    description:
      'Returns a paginated AwardResult[] sorted by createdAt descending.  ' +
      'Optional `status` filter (pending_acceptance | accepted | declined | ' +
      'offer_expired | rescinded).  Default page=1, limit=20.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of AwardResult' })
  listAwards(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() query: ListAwardsQueryDto,
  ) {
    return this.awardService.listAwards(programId, query);
  }

  // ── Get by application ─────────────────────────────────────────────────────

  /**
   * Get the award for a specific application.
   *
   * GET /scholarships/programs/:programId/applications/:applicationId/award
   *
   * Returns 404 when no award exists for this application.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Get('applications/:applicationId/award')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Get the award for a specific application (OWNER | ADMIN)',
    description:
      'Returns the AwardResult for the given application, or 404 ' +
      'RES_SCHOLARSHIP_AWARD_NOT_FOUND if no award has been created yet.',
  })
  @ApiResponse({ status: 200, description: 'AwardResult' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_AWARD_NOT_FOUND' })
  getAwardByApplication(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: AwardScopeQueryDto,
  ) {
    return this.awardService.getAwardByApplicationId(
      applicationId,
      scope.organizationId,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rescind controller — award-level, OWNER only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Award-level mutation endpoints accessible only to organization OWNERs.
 *
 * Route:
 *   POST /scholarships/awards/:awardId/rescind
 *
 * Placed in a separate controller class so the route prefix (`scholarships/awards`)
 * does not conflict with the program-scoped routes above.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Awards (Staff)')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/awards')
export class ScholarshipAwardMutationController {
  constructor(private readonly awardService: ScholarshipAwardService) {}

  /**
   * Rescind an ACCEPTED scholarship award.
   *
   * POST /scholarships/awards/:awardId/rescind
   *
   * Transitions the award ACCEPTED → RESCINDED and releases the linked budget
   * reservation (CONFIRMED → RELEASED), restoring capacity.
   *
   * A mandatory `reason` is required for audit / compliance purposes.
   *
   * Returns 422 BIZ_AWARD_INVALID_STATE when the award is not ACCEPTED.
   *
   * Authorization: OWNER only.
   */
  @Post(':awardId/rescind')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER)
  @ApiOperation({
    summary: 'Rescind an ACCEPTED scholarship award (OWNER only)',
    description:
      'Transitions the award ACCEPTED → RESCINDED and releases the linked ' +
      'budget reservation (CONFIRMED → RELEASED), restoring budget capacity.  ' +
      'Mandatory `reason` field required for compliance.  ' +
      'Returns 422 BIZ_AWARD_INVALID_STATE if the award is not in ACCEPTED state.',
  })
  @ApiResponse({ status: 201, description: 'Award rescinded — AwardResult' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_AWARD_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'BIZ_AWARD_INVALID_STATE' })
  rescindAward(
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Query() scope: AwardScopeQueryDto,
    @Body() dto: RescindAwardDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.awardService.rescindAward(
      scope.organizationId,
      awardId,
      actorId,
      dto,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Applicant controller — authenticated acceptance / decline / read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applicant-facing scholarship award endpoints.
 *
 * These routes are authenticated (JWT required) but do NOT require organization
 * membership — the applicant is a student, not an org member.  The service
 * enforces applicant identity by comparing the JWT `sub` with
 * `award.applicantId`.
 *
 * Route structure:
 *   GET  /scholarships/awards/:awardId           → Read own award
 *   POST /scholarships/awards/:awardId/accept    → Accept the offer
 *   POST /scholarships/awards/:awardId/decline   → Decline the offer
 *
 * Authorization: JWT required; caller must be the award's applicant.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Awards (Applicant)')
@UseGuards(JwtAuthGuard)
@Controller('scholarships/awards')
export class ApplicantAwardController {
  constructor(private readonly awardService: ScholarshipAwardService) {}

  /**
   * Read own award details.
   *
   * GET /scholarships/awards/:awardId
   *
   * Returns the AwardResult for the calling applicant.  Returns 403 when the
   * calling user is not the award's applicant.
   */
  @Get(':awardId')
  @ApiOperation({
    summary: 'Applicant: read own award',
    description:
      'Returns the AwardResult for the award identified by :awardId.  ' +
      'Returns 403 BIZ_AWARD_ACCEPTANCE_FORBIDDEN if the caller is not the ' +
      'applicant on this award.',
  })
  @ApiResponse({ status: 200, description: 'AwardResult' })
  @ApiResponse({ status: 403, description: 'BIZ_AWARD_ACCEPTANCE_FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_AWARD_NOT_FOUND' })
  getMyAward(
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @CurrentUser('sub') callerId: string,
  ) {
    // organizationId = null: the service performs applicant ownership check
    // rather than org membership check.
    return this.awardService.getAward(awardId, null, callerId);
  }

  /**
   * Accept the scholarship offer.
   *
   * POST /scholarships/awards/:awardId/accept
   *
   * Transitions the award PENDING_ACCEPTANCE → ACCEPTED and confirms the linked
   * budget reservation.  Returns 422 BIZ_AWARD_OFFER_EXPIRED when the
   * acceptance deadline has already passed.
   *
   * Authorization: The calling user must be the award's applicant.
   */
  @Post(':awardId/accept')
  @ApiOperation({
    summary: 'Applicant: accept a scholarship offer',
    description:
      'Formally accepts the award, transitioning its status to ACCEPTED.  ' +
      'The linked budget reservation (if any) is confirmed simultaneously.  ' +
      'Returns 403 if the caller is not the applicant.  ' +
      'Returns 422 BIZ_AWARD_OFFER_EXPIRED if the acceptance deadline has passed.  ' +
      'Returns 422 BIZ_AWARD_INVALID_STATE if the award is not in PENDING_ACCEPTANCE.',
  })
  @ApiResponse({ status: 201, description: 'Award accepted — AwardResult' })
  @ApiResponse({ status: 403, description: 'BIZ_AWARD_ACCEPTANCE_FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_AWARD_NOT_FOUND' })
  @ApiResponse({
    status: 422,
    description: 'BIZ_AWARD_OFFER_EXPIRED | BIZ_AWARD_INVALID_STATE',
  })
  acceptAward(
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Body() dto: AcceptAwardDto,
    @CurrentUser('sub') callerId: string,
  ) {
    return this.awardService.acceptAward(awardId, callerId, dto);
  }

  /**
   * Decline the scholarship offer.
   *
   * POST /scholarships/awards/:awardId/decline
   *
   * Transitions the award PENDING_ACCEPTANCE → DECLINED and cancels the linked
   * budget reservation, freeing the held amount back to available capacity.
   *
   * Authorization: The calling user must be the award's applicant.
   */
  @Post(':awardId/decline')
  @ApiOperation({
    summary: 'Applicant: decline a scholarship offer',
    description:
      'Formally declines the award offer, transitioning status to DECLINED.  ' +
      'The linked budget reservation (if any) is cancelled, returning the ' +
      'held amount to available budget.  ' +
      'Returns 403 if the caller is not the applicant.  ' +
      'Returns 422 BIZ_AWARD_INVALID_STATE if the award is not PENDING_ACCEPTANCE.',
  })
  @ApiResponse({ status: 201, description: 'Award declined — AwardResult' })
  @ApiResponse({ status: 403, description: 'BIZ_AWARD_ACCEPTANCE_FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_AWARD_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'BIZ_AWARD_INVALID_STATE' })
  declineAward(
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Body() dto: DeclineAwardDto,
    @CurrentUser('sub') callerId: string,
  ) {
    return this.awardService.declineAward(awardId, callerId, dto);
  }
}
