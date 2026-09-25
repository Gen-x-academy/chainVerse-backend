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
import { ReviewInfoRequestService } from '../services/review-info-request.service';
import {
  CancelInfoRequestDto,
  CreateInfoRequestDto,
  InfoRequestScopeQueryDto,
  ListInfoRequestsQueryDto,
  SubmitInfoResponseDto,
} from '../dto/review-info-request.dto';

/**
 * Info-request endpoints nested under a scholarship program.
 *
 * Two groups of routes are provided:
 *
 * 1. Staff routes (OWNER / ADMIN / INSTRUCTOR) — create, cancel, and list
 *    requests.  These are nested under
 *    `/scholarships/programs/:programId/applications/:applicationId/info-requests`.
 *
 * 2. Applicant routes — submit a versioned response.  Nested under
 *    `/scholarships/info-requests/:requestId/responses`.
 *    The guard still requires a valid JWT; the service enforces that the
 *    authenticated caller is the applicant who owns the application.
 *
 * Tenant isolation:
 *   `organizationId` is sourced from the query string and verified by
 *   OrganizationRolesGuard before any handler runs.  The service performs a
 *   second ownership check to defend against IDOR.
 *
 * Privacy:
 *   - Reviewer identity and question content are staff-only data.
 *   - The applicant-facing response endpoint exposes the minimum necessary
 *     fields; additional field-masking can be applied via a response
 *     interceptor if role-based projection is required.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Review Info Requests')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller()
export class ReviewInfoRequestController {
  constructor(
    private readonly infoRequestService: ReviewInfoRequestService,
  ) {}

  // ── Staff: create ──────────────────────────────────────────────────────────

  /**
   * Create an info-request asking the applicant for additional information.
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/info-requests
   *
   * The application must be in UNDER_REVIEW status.  The reviewer supplies
   * one or more bounded questions and a response deadline.  The applicant is
   * notified by email upon creation.
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR of the organization.
   */
  @Post(
    'scholarships/programs/:programId/applications/:applicationId/info-requests',
  )
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Create an info-request for additional applicant information',
    description:
      'Application must be in UNDER_REVIEW status. ' +
      'At least one question required. ' +
      'deadline must be a future UTC timestamp. ' +
      'questionKey values must be unique within the request. ' +
      'Applicant is notified by email on creation.',
  })
  @ApiResponse({ status: 201, description: 'Info-request created.' })
  @ApiResponse({
    status: 400,
    description:
      'VAL_INFO_REQUEST_NO_QUESTIONS | VAL_INFO_REQUEST_DEADLINE_PAST',
  })
  @ApiResponse({
    status: 422,
    description: 'BIZ_INFO_REQUEST_INVALID_STATE — application not UNDER_REVIEW',
  })
  @ApiResponse({
    status: 404,
    description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND',
  })
  createRequest(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: InfoRequestScopeQueryDto,
    @Body() dto: CreateInfoRequestDto,
    @CurrentUser('sub') reviewerId: string,
  ) {
    return this.infoRequestService.createRequest(
      scope.organizationId,
      applicationId,
      reviewerId,
      dto,
    );
  }

  // ── Staff: list ────────────────────────────────────────────────────────────

  /**
   * List all info-requests for an application, optionally filtered by status.
   *
   * GET /scholarships/programs/:programId/applications/:applicationId/info-requests
   *
   * Returns the full document including questions, responses, and reviewer
   * identity — staff-only data.
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR of the organization.
   */
  @Get(
    'scholarships/programs/:programId/applications/:applicationId/info-requests',
  )
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'List info-requests for an application (staff only)',
    description:
      'Returns all info-requests for the application. ' +
      'Optional ?status filter. Sorted by createdAt descending.',
  })
  @ApiResponse({ status: 200, description: 'Array of InfoRequestResult.' })
  @ApiResponse({
    status: 404,
    description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND',
  })
  listRequests(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() query: ListInfoRequestsQueryDto,
  ) {
    return this.infoRequestService.listRequests(
      query.organizationId,
      applicationId,
      query,
    );
  }

  // ── Staff: get single ──────────────────────────────────────────────────────

  /**
   * Get a single info-request by id.
   *
   * GET /scholarships/programs/:programId/info-requests/:requestId
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR of the organization.
   */
  @Get('scholarships/programs/:programId/info-requests/:requestId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Get a single info-request by id (staff only)',
  })
  @ApiResponse({ status: 200, description: 'InfoRequestResult.' })
  @ApiResponse({ status: 404, description: 'RES_INFO_REQUEST_NOT_FOUND' })
  getRequest(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('requestId', new ParseObjectIdPipe()) requestId: string,
    @Query() scope: InfoRequestScopeQueryDto,
  ) {
    return this.infoRequestService.getRequest(
      scope.organizationId,
      requestId,
    );
  }

  // ── Staff: cancel ──────────────────────────────────────────────────────────

  /**
   * Cancel an info-request.
   *
   * DELETE /scholarships/programs/:programId/info-requests/:requestId
   *
   * Only the reviewer who created the request may cancel it.
   * The request must be in OPEN or RESPONDED status.
   * The applicant is notified by email on cancellation.
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR of the organization.
   * Service enforces that the caller is the original reviewer.
   */
  @Delete('scholarships/programs/:programId/info-requests/:requestId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Cancel an info-request (creating reviewer only)',
    description:
      'Transitions status to CANCELLED. ' +
      'Only the reviewer who created the request may cancel it. ' +
      'Applicant is notified by email.',
  })
  @ApiResponse({ status: 200, description: 'Cancelled InfoRequestResult.' })
  @ApiResponse({
    status: 403,
    description: 'BIZ_INFO_REQUEST_CANCEL_FORBIDDEN — not the creating reviewer',
  })
  @ApiResponse({
    status: 422,
    description: 'BIZ_INFO_REQUEST_INVALID_STATE — already CANCELLED or EXPIRED',
  })
  @ApiResponse({ status: 404, description: 'RES_INFO_REQUEST_NOT_FOUND' })
  cancelRequest(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('requestId', new ParseObjectIdPipe()) requestId: string,
    @Query() scope: InfoRequestScopeQueryDto,
    @Body() dto: CancelInfoRequestDto,
    @CurrentUser('sub') reviewerId: string,
  ) {
    return this.infoRequestService.cancelRequest(
      scope.organizationId,
      requestId,
      reviewerId,
      dto,
    );
  }

  // ── Applicant: submit response ─────────────────────────────────────────────

  /**
   * Submit a versioned response to an info-request.
   *
   * POST /scholarships/info-requests/:requestId/responses
   *
   * The request must be OPEN or RESPONDED and the deadline must not have
   * passed.  Each submission appends a new version to the `responses` array;
   * the first submission also transitions status to RESPONDED.
   *
   * The service validates that all required questions are answered and that
   * no unknown questionId values are supplied.
   *
   * Authorization: any authenticated user — the service enforces that the
   * caller is the applicant who owns the application.
   */
  @Post('scholarships/info-requests/:requestId/responses')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Submit a versioned response to an info-request (applicant)',
    description:
      'Request must be OPEN or RESPONDED; deadline must not have passed. ' +
      'All required questions must be answered. ' +
      'Each call appends a new versioned response. ' +
      'Reviewer is notified by email on submission.',
  })
  @ApiResponse({ status: 201, description: 'Updated InfoRequestResult.' })
  @ApiResponse({
    status: 400,
    description:
      'VAL_INFO_REQUEST_UNKNOWN_QUESTION | VAL_INFO_REQUEST_REQUIRED_ANSWER_MISSING',
  })
  @ApiResponse({
    status: 403,
    description: 'AUTH_INSUFFICIENT_PERMISSIONS — caller is not the applicant',
  })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_INFO_REQUEST_INVALID_STATE | BIZ_INFO_REQUEST_DEADLINE_PASSED',
  })
  @ApiResponse({ status: 404, description: 'RES_INFO_REQUEST_NOT_FOUND' })
  submitResponse(
    @Param('requestId', new ParseObjectIdPipe()) requestId: string,
    @Query() scope: InfoRequestScopeQueryDto,
    @Body() dto: SubmitInfoResponseDto,
    @CurrentUser('sub') applicantId: string,
  ) {
    return this.infoRequestService.submitResponse(
      scope.organizationId,
      requestId,
      applicantId,
      dto,
    );
  }
}
