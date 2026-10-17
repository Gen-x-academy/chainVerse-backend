import {
  Body,
  Controller,
  Get,
  Param,
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
import { CommitteeDecisionService } from '../services/committee-decision.service';
import {
  CastVoteDto,
  DecisionScopeQueryDto,
  ListDecisionsQueryDto,
  OpenDecisionRoundDto,
  OverrideDecisionDto,
} from '../dto/committee-decision.dto';
import { RequestWithOrgMembership } from '../../common/guards/organization-roles.guard';

/**
 * Committee decision endpoints nested under a scholarship program.
 *
 * Route structure:
 *   POST   /scholarships/programs/:programId/applications/:applicationId/committee-decision
 *          → Open a decision round (OWNER | ADMIN)
 *
 *   POST   /scholarships/programs/:programId/applications/:applicationId/committee-decision/votes
 *          → Cast or amend a vote (OWNER | ADMIN | INSTRUCTOR)
 *
 *   POST   /scholarships/programs/:programId/applications/:applicationId/committee-decision/override
 *          → Override the resolved outcome (OWNER only)
 *
 *   GET    /scholarships/programs/:programId/applications/:applicationId/committee-decision
 *          → Get the decision for one application (OWNER | ADMIN | INSTRUCTOR)
 *
 *   GET    /scholarships/programs/:programId/applications/:applicationId/committee-decision/audit
 *          → Get the full audit trail (OWNER | ADMIN)
 *
 *   GET    /scholarships/programs/:programId/committee-decisions
 *          → List all decisions for a program (OWNER | ADMIN)
 *
 * Authorization model:
 *   - All routes require a valid JWT (JwtAuthGuard) and organization membership
 *     (OrganizationRolesGuard).  `organizationId` is always sourced from the
 *     query string so the guard can verify it before the handler executes.
 *   - Voting is open to OWNER, ADMIN, and INSTRUCTOR.
 *   - Overriding, listing, and audit access are restricted to OWNER / ADMIN.
 *
 * Tenant isolation:
 *   The guard resolves `organizationId` from the query string and verifies
 *   membership before any handler runs.  The service performs a second
 *   ownership check (all queries include `organizationId`).
 *
 * Privacy:
 *   - Individual votes and the audit trail are staff-only data.
 *   - Only `outcome` and `resolvedAt` may be exposed to applicants (the
 *     `getDecision` endpoint returns the full document; a separate thin public
 *     endpoint should be added if applicant-facing access is needed).
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Committee Decisions')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/programs/:programId')
export class CommitteeDecisionController {
  constructor(
    private readonly decisionService: CommitteeDecisionService,
  ) {}

  // ── Open a decision round ─────────────────────────────────────────────────

  /**
   * Open a committee decision round for an application.
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/committee-decision
   *
   * Creates the CommitteeDecision document with outcome = PENDING and the
   * supplied `quorumRequired`.  Exactly one decision document may exist per
   * application; a second call returns 409.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Post('applications/:applicationId/committee-decision')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Open a committee decision round for an application',
    description:
      'Creates a new CommitteeDecision document (outcome = PENDING). ' +
      'Exactly one decision round per application — returns 409 if one ' +
      'already exists.  Set `quorumRequired` to the minimum number of ' +
      'non-recused votes needed to resolve the outcome.',
  })
  @ApiResponse({ status: 201, description: 'Decision round opened — CommitteeDecisionResult' })
  @ApiResponse({ status: 404, description: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'BIZ_DECISION_ALREADY_EXISTS' })
  openDecisionRound(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: DecisionScopeQueryDto,
    @Body() dto: OpenDecisionRoundDto,
    @CurrentUser('sub') actorId: string,
    @Req() req: RequestWithOrgMembership,
  ) {
    const displayName = req.organizationMembership?.role ?? actorId;
    return this.decisionService.openDecisionRound(
      scope.organizationId,
      applicationId,
      dto,
      actorId,
      displayName,
    );
  }

  // ── Cast a vote ───────────────────────────────────────────────────────────

  /**
   * Cast or amend a committee vote on an application.
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/committee-decision/votes
   *
   * - First call from a member: creates a new vote entry.
   * - Subsequent call from the same member: marks the previous vote
   *   `superseded` and appends an amendment with `amendedFromVoteId` set.
   * - RECUSE vote: member is excluded from quorum and tally going forward;
   *   a recused member cannot later cast a substantive vote (409).
   * - After every non-RECUSE vote the service checks whether quorum has been
   *   reached and resolves the outcome if so.
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR.
   */
  @Post('applications/:applicationId/committee-decision/votes')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Cast or amend a committee vote on an application',
    description:
      'First call: creates a vote.  Subsequent call by the same member: ' +
      'amends the previous vote (old entry marked superseded). ' +
      'RECUSE: removes the member from quorum and tally; cannot be undone. ' +
      'Outcome is re-evaluated after every eligible (non-RECUSE) vote.',
  })
  @ApiResponse({ status: 201, description: 'Vote recorded — CommitteeDecisionResult' })
  @ApiResponse({ status: 404, description: 'RES_COMMITTEE_DECISION_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'BIZ_ALREADY_RECUSED' })
  castVote(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: DecisionScopeQueryDto,
    @Body() dto: CastVoteDto,
    @CurrentUser('sub') memberId: string,
    @Req() req: RequestWithOrgMembership,
  ) {
    const memberRole = req.organizationMembership?.role ?? 'member';
    return this.decisionService.castVote(
      scope.organizationId,
      applicationId,
      memberId,
      dto,
      memberRole,
    );
  }

  // ── Override outcome ──────────────────────────────────────────────────────

  /**
   * Override the resolved (or pending) outcome with a manual decision.
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/committee-decision/override
   *
   * - Permitted at any time — before quorum, after quorum, or on top of a
   *   previous override.
   * - The full vote history is never erased; the override is appended to
   *   `overrides[]` and the audit trail.
   * - `newOutcome` must not be PENDING (returns 422).
   * - `justification` is mandatory.
   *
   * Authorization: OWNER only.
   */
  @Post('applications/:applicationId/committee-decision/override')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER)
  @ApiOperation({
    summary: 'Override the committee outcome (OWNER only)',
    description:
      'Applies a manual outcome on top of the vote tally.  Vote history is ' +
      'preserved.  Every override is recorded in overrides[] and the audit ' +
      'trail.  `newOutcome` must be a terminal state (not PENDING). ' +
      '`justification` is required.',
  })
  @ApiResponse({ status: 201, description: 'Override applied — CommitteeDecisionResult' })
  @ApiResponse({ status: 404, description: 'RES_COMMITTEE_DECISION_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'BIZ_OVERRIDE_OUTCOME_INVALID' })
  overrideOutcome(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: DecisionScopeQueryDto,
    @Body() dto: OverrideDecisionDto,
    @CurrentUser('sub') actorId: string,
    @Req() req: RequestWithOrgMembership,
  ) {
    const displayName = req.organizationMembership?.role ?? actorId;
    return this.decisionService.overrideOutcome(
      scope.organizationId,
      applicationId,
      actorId,
      dto,
      displayName,
    );
  }

  // ── Get a single decision ─────────────────────────────────────────────────

  /**
   * Get the committee decision document for one application.
   *
   * GET /scholarships/programs/:programId/applications/:applicationId/committee-decision
   *
   * Returns the full CommitteeDecisionResult including all effective votes.
   * Staff-only — do not expose to applicants directly (return only `outcome`
   * and `resolvedAt` for applicant-facing views).
   *
   * Authorization: OWNER, ADMIN, or INSTRUCTOR.
   */
  @Get('applications/:applicationId/committee-decision')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Get the committee decision for an application (staff only)',
    description:
      'Returns CommitteeDecisionResult with all effective votes, quorum ' +
      'status, outcome, and override count.  Staff-only: do not expose ' +
      'vote details to applicants.',
  })
  @ApiResponse({ status: 200, description: 'CommitteeDecisionResult' })
  @ApiResponse({ status: 404, description: 'RES_COMMITTEE_DECISION_NOT_FOUND' })
  getDecision(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: DecisionScopeQueryDto,
  ) {
    return this.decisionService.getDecision(
      scope.organizationId,
      applicationId,
    );
  }

  // ── Audit trail ───────────────────────────────────────────────────────────

  /**
   * Get the full audit trail for a committee decision.
   *
   * GET /scholarships/programs/:programId/applications/:applicationId/committee-decision/audit
   *
   * Returns every action entry appended to the decision's `auditTrail` array,
   * in chronological order.  Restricted to OWNER / ADMIN to protect the
   * sensitivity of actor identities and payload details.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Get('applications/:applicationId/committee-decision/audit')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Get the full audit trail for a committee decision (OWNER | ADMIN)',
    description:
      'Returns the append-only auditTrail array in chronological order. ' +
      'Each entry records the action, actor, timestamp, and action-specific ' +
      'payload.  Restricted to OWNER and ADMIN to protect actor identity data.',
  })
  @ApiResponse({
    status: 200,
    description: '{ decisionId: string; auditTrail: DecisionAuditEntry[] }',
  })
  @ApiResponse({ status: 404, description: 'RES_COMMITTEE_DECISION_NOT_FOUND' })
  getAuditTrail(
    @Param('programId', new ParseObjectIdPipe()) _programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: DecisionScopeQueryDto,
  ) {
    return this.decisionService.getAuditTrail(
      scope.organizationId,
      applicationId,
    );
  }

  // ── Program-level list ────────────────────────────────────────────────────

  /**
   * List all committee decisions for a program.
   *
   * GET /scholarships/programs/:programId/committee-decisions
   *
   * Returns every CommitteeDecisionResult for the program, sorted by
   * `createdAt` ascending.  Filter by `outcome` to narrow results
   * (e.g. `?outcome=awarded&organizationId=...`).
   *
   * Authorization: OWNER or ADMIN.
   */
  @Get('committee-decisions')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'List all committee decisions for a program',
    description:
      'Returns CommitteeDecisionResult[] sorted by createdAt asc. ' +
      'Optional `outcome` filter (shortlist | waitlist | awarded | ' +
      'rejected | tie | override | pending).',
  })
  @ApiResponse({ status: 200, description: 'Array of CommitteeDecisionResult' })
  listDecisions(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() query: ListDecisionsQueryDto,
  ) {
    return this.decisionService.listDecisions(programId, query);
  }
}
