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
import { ScholarshipReviewService } from '../services/scholarship-review.service';
import {
  AbstainReviewDto,
  AggregateScoreQueryDto,
  ListReviewsQueryDto,
  SubmitReviewDto,
} from '../dto/scholarship-review.dto';

/**
 * Review endpoints nested under a scholarship program.
 *
 * All routes require:
 *   - A valid JWT (JwtAuthGuard).
 *   - Membership in the target organization with an appropriate role
 *     (OrganizationRolesGuard + @OrgRoles / @OrgScope).
 *
 * Tenant isolation:
 *   `organizationId` is always sourced from the query string and verified
 *   by OrganizationRolesGuard before any handler runs.  The service performs
 *   a second ownership check to defend against IDOR attacks.
 *
 * Privacy:
 *   - Individual reviewer identities and per-criterion scores are staff-only
 *     data.  These routes must never be exposed to applicants.
 *   - Only the blinded aggregate score endpoint
 *     (GET …/applications/:applicationId/reviews/aggregate) is safe to share
 *     with a wider audience; all other review data is restricted to
 *     OWNER / ADMIN / INSTRUCTOR.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Reviews')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/programs/:programId')
export class ScholarshipReviewController {
  constructor(private readonly reviewService: ScholarshipReviewService) {}

  // ── Per-application review routes ─────────────────────────────────────────

  /**
   * Submit a rubric review for an application.
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/reviews
   *
   * The application must be in UNDER_REVIEW status.  Each reviewer may submit
   * exactly one review per application; subsequent submissions return 409.
   *
   * The per-review `normalizedScore` is computed and stored atomically:
   *   normalizedScore = Σ (score / maxScore) × weight  [rounded to 4 d.p.]
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR of the organization.
   */
  @Post('applications/:applicationId/reviews')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Submit a rubric review for an application',
    description:
      'Application must be in UNDER_REVIEW status. ' +
      'One review per reviewer per application. ' +
      'Criteria weights must sum to 1.0 (±0.001). ' +
      'Each score must be in [0, maxScore].',
  })
  @ApiResponse({ status: 201, description: 'Review submitted' })
  @ApiResponse({
    status: 400,
    description:
      'VAL_RUBRIC_CRITERIA_EMPTY | VAL_RUBRIC_WEIGHTS_INVALID | VAL_RUBRIC_SCORE_OUT_OF_RANGE',
  })
  @ApiResponse({
    status: 409,
    description:
      'BIZ_REVIEW_ALREADY_EXISTS | BIZ_APPLICATION_NOT_UNDER_REVIEW',
  })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND' })
  submitReview(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: AggregateScoreQueryDto,
    @Body() dto: SubmitReviewDto,
    @CurrentUser('sub') reviewerId: string,
  ) {
    return this.reviewService.submitReview(
      scope.organizationId,
      applicationId,
      reviewerId,
      dto,
    );
  }

  /**
   * Record a formal abstention for an application.
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/reviews/abstain
   *
   * An abstained review is persisted (ABSTAINED status) but excluded from
   * aggregate computation and does not count against the completed-review
   * divisor.  This lets a reviewer formally signal "I am not scoring this"
   * without distorting the panel average.
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR of the organization.
   */
  @Post('applications/:applicationId/reviews/abstain')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Record a formal abstention (reviewer declines to score)',
    description:
      'Abstained reviews are excluded from aggregate computation. ' +
      'One abstention per reviewer per application.',
  })
  @ApiResponse({ status: 201, description: 'Abstention recorded' })
  @ApiResponse({
    status: 409,
    description:
      'BIZ_REVIEW_ALREADY_EXISTS | BIZ_APPLICATION_NOT_UNDER_REVIEW',
  })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND' })
  abstainReview(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: AggregateScoreQueryDto,
    @Body() dto: AbstainReviewDto,
    @CurrentUser('sub') reviewerId: string,
  ) {
    return this.reviewService.abstainReview(
      scope.organizationId,
      applicationId,
      reviewerId,
      dto,
    );
  }

  /**
   * List all reviews for an application, with optional status filter.
   *
   * GET /scholarships/programs/:programId/applications/:applicationId/reviews
   *
   * Returns reviewer identities and per-criterion scores — staff-only data.
   * Must not be surfaced to applicants.
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR of the organization.
   */
  @Get('applications/:applicationId/reviews')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'List reviews for an application (staff only)',
    description:
      'Returns all reviews (with reviewer identities and scores). ' +
      'Staff-only; must not be exposed to applicants.',
  })
  @ApiResponse({ status: 200, description: 'Array of reviews' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND' })
  listReviews(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.reviewService.listReviews(
      query.organizationId,
      applicationId,
      query.status,
    );
  }

  /**
   * Get a single review by id.
   *
   * GET /scholarships/programs/:programId/reviews/:reviewId
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR of the organization.
   */
  @Get('reviews/:reviewId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({ summary: 'Get a single review by id (staff only)' })
  @ApiResponse({ status: 200, description: 'Review document' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_REVIEW_NOT_FOUND' })
  getReview(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('reviewId', new ParseObjectIdPipe()) reviewId: string,
    @Query() scope: AggregateScoreQueryDto,
  ) {
    return this.reviewService.getReview(scope.organizationId, reviewId);
  }

  /**
   * Compute and return the normalized aggregate score for one application.
   *
   * GET /scholarships/programs/:programId/applications/:applicationId/reviews/aggregate
   *
   * Algorithm:
   *   1. Collect normalizedScore from every COMPLETED review.
   *   2. Average them and round to 4 decimal places.
   *   PENDING and ABSTAINED reviews are excluded from the divisor.
   *
   * Returns BIZ_NO_COMPLETED_REVIEWS (422) when no completed reviews exist,
   * rather than a misleading 0.0 aggregate.
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR of the organization.
   */
  @Get('applications/:applicationId/reviews/aggregate')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Get the normalized aggregate score for an application',
    description:
      'Mean of all COMPLETED per-review weighted normalized scores, ' +
      'rounded to 4 decimal places. ' +
      'Returns 422 BIZ_NO_COMPLETED_REVIEWS when no completed reviews exist.',
  })
  @ApiResponse({
    status: 200,
    description:
      'AggregateScoreResult: { applicationId, aggregateScore, ' +
      'completedReviewCount, pendingReviewCount, abstainedReviewCount, computedAt }',
  })
  @ApiResponse({
    status: 422,
    description: 'BIZ_NO_COMPLETED_REVIEWS — no completed reviews yet',
  })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND' })
  getAggregateScore(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: AggregateScoreQueryDto,
  ) {
    return this.reviewService.getAggregateScore(
      scope.organizationId,
      applicationId,
    );
  }

  // ── Program-level ranking route ───────────────────────────────────────────

  /**
   * Return ranked aggregate scores for all applications in a program.
   *
   * GET /scholarships/programs/:programId/rankings
   *
   * Only applications with at least one COMPLETED review appear in the
   * response.  Results are ordered by aggregateScore descending; ties are
   * broken by the earliest COMPLETED review's submittedAt ascending
   * (earlier submission wins — deterministic and reproducible).
   *
   * Authorization: OWNER or ADMIN only (more sensitive than single-app aggregate).
   */
  @Get('rankings')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Get ranked aggregate scores for all applications in a program',
    description:
      'Sorted by aggregateScore desc. Tie-break: earliest COMPLETED review ' +
      'submittedAt asc (deterministic). Only applications with ≥1 COMPLETED ' +
      'review are included.',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of AggregateScoreResult sorted by rank',
  })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_PROGRAM_NOT_FOUND' })
  getProgramRankings(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: AggregateScoreQueryDto,
  ) {
    return this.reviewService.getProgramRankings(
      scope.organizationId,
      programId,
    );
  }
}
