import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../../common/guards/organization-roles.guard';
import {
  OrgRoles,
  OrgScope,
} from '../../common/decorators/org-roles.decorator';
import { OrganizationRole } from '../../common/enums/organization-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AwardAgreementService } from '../services/award-agreement.service';
import {
  AcceptAwardWithAgreementDto,
  AgreementScopeQueryDto,
  CreateAgreementDto,
} from '../dto/award-agreement.dto';

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Extracts the client IP address from the HTTP request.
 *
 * Checks `X-Forwarded-For` first (populated by reverse proxies / load
 * balancers); falls back to `socket.remoteAddress`.  Returns `null` when
 * neither is available (e.g. test environments).
 *
 * Security note:
 *   `X-Forwarded-For` is trivially spoofable by clients.  Use it only for
 *   informational audit logging, not for access-control decisions.
 */
function extractClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return first.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Applicant controller — atomic accept + sign
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applicant-facing award agreement endpoints.
 *
 * These routes are authenticated (JWT required) but do NOT require
 * organization membership — the applicant is a student, not an org member.
 * The service enforces applicant identity by comparing the JWT `sub` with
 * `award.applicantId`.
 *
 * Route structure:
 *
 *   POST /scholarships/awards/:awardId/accept-with-agreement
 *     → Atomic: accept the offer + record the signed agreement in one request.
 *       Returns the AwardAgreementResult on success.
 *
 *   GET  /scholarships/awards/:awardId/agreement
 *     → Retrieve own signed agreement (applicant self-read).
 *       Returns 403 when the caller is not the agreement signer.
 *
 * Authorization model:
 *   - JWT required for all routes (`JwtAuthGuard`).
 *   - No `OrganizationRolesGuard` — applicants are not org members.
 *   - The service performs applicant ownership checks (JWT `sub` must equal
 *     `award.applicantId` / `agreement.signerUserId`).
 *
 * Privacy:
 *   - `signerIpAddress` is captured server-side from `X-Forwarded-For` /
 *     `socket.remoteAddress`; the client never supplies it.
 *   - The full AwardAgreementResult (including `signerIpAddress`) is returned
 *     to the signer — they are the data subject.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Award Agreements (Applicant)')
@UseGuards(JwtAuthGuard)
@Controller('scholarships/awards')
export class ApplicantAwardAgreementController {
  constructor(private readonly agreementService: AwardAgreementService) {}

  // ── Atomic accept + sign ───────────────────────────────────────────────────

  /**
   * Atomically accept the scholarship offer and record the signed agreement.
   *
   * POST /scholarships/awards/:awardId/accept-with-agreement
   *
   * Combines the offer acceptance with the agreement signing in a single
   * request to guarantee consistency: either both operations succeed or
   * neither is persisted.
   *
   * The service:
   *   1. Verifies the caller is the award's applicant.
   *   2. Validates all required declarations are acknowledged.
   *   3. Verifies the award is PENDING_ACCEPTANCE and within deadline.
   *   4. Resolves the currently published terms version and computes its hash.
   *   5. Persists an immutable AwardAgreement document.
   *   6. Transitions award PENDING_ACCEPTANCE → ACCEPTED.
   *   7. Confirms the linked BudgetReservation (PENDING → CONFIRMED) if present.
   *
   * Returns:
   *   201  AwardAgreementResult
   *   400  VAL_AGREEMENT_DECLARATIONS_INCOMPLETE
   *   403  BIZ_AWARD_ACCEPTANCE_FORBIDDEN
   *   404  RES_SCHOLARSHIP_AWARD_NOT_FOUND | RES_TERMS_VERSION_NOT_FOUND
   *   409  BIZ_AWARD_AGREEMENT_ALREADY_EXISTS
   *   422  BIZ_AGREEMENT_DECLINED_OFFER | BIZ_AWARD_OFFER_EXPIRED | BIZ_AWARD_INVALID_STATE
   */
  @Post(':awardId/accept-with-agreement')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Applicant: atomically accept offer and record signed agreement',
    description:
      'Combines offer acceptance with agreement signing in a single atomic ' +
      'request.  All required declarations must be acknowledged.  The service ' +
      'resolves and snapshots the current published program terms internally — ' +
      'callers do not supply termsVersionNumber.  ' +
      'Returns 400 VAL_AGREEMENT_DECLARATIONS_INCOMPLETE when any required ' +
      'declaration is missing or unset.  ' +
      'Returns 409 BIZ_AWARD_AGREEMENT_ALREADY_EXISTS when an agreement ' +
      'already exists for this award.  ' +
      'Returns 422 BIZ_AWARD_OFFER_EXPIRED when the acceptance deadline has ' +
      'passed.  ' +
      'Returns 422 BIZ_AWARD_INVALID_STATE when the award is not ' +
      'PENDING_ACCEPTANCE.',
  })
  @ApiResponse({
    status: 201,
    description: 'Offer accepted and agreement recorded — AwardAgreementResult',
  })
  @ApiResponse({
    status: 400,
    description: 'VAL_AGREEMENT_DECLARATIONS_INCOMPLETE',
  })
  @ApiResponse({ status: 403, description: 'BIZ_AWARD_ACCEPTANCE_FORBIDDEN' })
  @ApiResponse({
    status: 404,
    description: 'RES_SCHOLARSHIP_AWARD_NOT_FOUND | RES_TERMS_VERSION_NOT_FOUND',
  })
  @ApiResponse({
    status: 409,
    description: 'BIZ_AWARD_AGREEMENT_ALREADY_EXISTS',
  })
  @ApiResponse({
    status: 422,
    description:
      'BIZ_AGREEMENT_DECLINED_OFFER | BIZ_AWARD_OFFER_EXPIRED | BIZ_AWARD_INVALID_STATE',
  })
  acceptWithAgreement(
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Body() dto: AcceptAwardWithAgreementDto,
    @CurrentUser('sub') callerId: string,
    @Req() req: Request,
  ) {
    return this.agreementService.acceptWithAgreement(
      awardId,
      callerId,
      extractClientIp(req),
      dto,
    );
  }

  // ── Self-read ──────────────────────────────────────────────────────────────

  /**
   * Retrieve the signed agreement for an award (applicant self-read).
   *
   * GET /scholarships/awards/:awardId/agreement
   *
   * Returns the AwardAgreementResult for the calling applicant's signed
   * agreement.  Returns 403 when the caller is not the agreement signer.
   *
   * Returns:
   *   200  AwardAgreementResult
   *   403  BIZ_AWARD_ACCEPTANCE_FORBIDDEN
   *   404  RES_AWARD_AGREEMENT_NOT_FOUND
   */
  @Get(':awardId/agreement')
  @ApiOperation({
    summary: 'Applicant: read own signed agreement',
    description:
      'Returns the AwardAgreementResult for the award agreement identified by ' +
      ':awardId.  Returns 403 BIZ_AWARD_ACCEPTANCE_FORBIDDEN if the caller ' +
      'is not the agreement signer.',
  })
  @ApiResponse({ status: 200, description: 'AwardAgreementResult' })
  @ApiResponse({ status: 403, description: 'BIZ_AWARD_ACCEPTANCE_FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'RES_AWARD_AGREEMENT_NOT_FOUND' })
  getMyAgreement(
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @CurrentUser('sub') callerId: string,
  ) {
    // organizationId = null: service performs signer ownership check instead.
    return this.agreementService.getAgreement(awardId, null, callerId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff controller — out-of-band agreement creation + read + verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Staff-facing award agreement endpoints.
 *
 * All routes require a valid JWT and verified organization membership
 * (`OrganizationRolesGuard`).  `organizationId` is always sourced from the
 * request body or query string so the guard verifies membership before any
 * handler runs.
 *
 * Route structure:
 *
 *   POST /scholarships/awards/:awardId/agreement
 *     → Record a signed agreement for an already-ACCEPTED award (out-of-band
 *       flow, e.g. paper signature uploaded by staff).
 *       Authorization: OWNER or ADMIN.
 *
 *   GET  /scholarships/awards/:awardId/agreement/staff
 *     → Retrieve the agreement for any award in the organization.
 *       Authorization: OWNER or ADMIN.
 *
 *   GET  /scholarships/awards/:awardId/agreement/verify
 *     → Verify the termsSnapshotHash stored on the agreement against the live
 *       terms version document.
 *       Authorization: OWNER or ADMIN.
 *
 * Tenant isolation:
 *   The guard resolves `organizationId` from the query string and verifies
 *   membership.  The service performs a second ownership check on every query.
 *
 * Privacy:
 *   Agreement documents contain PII (`signerIpAddress`) and legally sensitive
 *   data.  These endpoints must not be accessible to applicants.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Award Agreements (Staff)')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/awards')
export class StaffAwardAgreementController {
  constructor(private readonly agreementService: AwardAgreementService) {}

  // ── Out-of-band create ─────────────────────────────────────────────────────

  /**
   * Record a signed agreement for an already-ACCEPTED award.
   *
   * POST /scholarships/awards/:awardId/agreement
   *
   * Intended for out-of-band acceptance flows where the applicant signed a
   * paper agreement that staff subsequently upload.  The award must already
   * be in ACCEPTED state; the caller supplies `termsVersionNumber`,
   * `termsSnapshotHash`, `signerUserId`, and `declarations`.
   *
   * The service validates that `signerUserId` equals `award.applicantId` and
   * that `termsSnapshotHash` matches the recomputed hash of the stored terms
   * version.
   *
   * Returns:
   *   201  AwardAgreementResult
   *   400  VAL_AGREEMENT_DECLARATIONS_INCOMPLETE
   *   403  BIZ_AWARD_ACCEPTANCE_FORBIDDEN
   *   404  RES_SCHOLARSHIP_AWARD_NOT_FOUND | RES_TERMS_VERSION_NOT_FOUND
   *   409  BIZ_AWARD_AGREEMENT_ALREADY_EXISTS
   *   422  BIZ_AGREEMENT_NOT_ACCEPTED
   */
  @Post(':awardId/agreement')
  @OrgScope({ source: 'body', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Staff: record out-of-band signed agreement for ACCEPTED award (OWNER | ADMIN)',
    description:
      'Records a signed agreement document for an award that has already been ' +
      'transitioned to ACCEPTED via an out-of-band flow (e.g. paper signature).  ' +
      'The award must be in ACCEPTED state (BIZ_AGREEMENT_NOT_ACCEPTED otherwise).  ' +
      'signerUserId must equal award.applicantId (BIZ_AWARD_ACCEPTANCE_FORBIDDEN).  ' +
      'termsSnapshotHash is verified against the stored terms version.  ' +
      'Returns 409 BIZ_AWARD_AGREEMENT_ALREADY_EXISTS if an agreement already exists.',
  })
  @ApiResponse({
    status: 201,
    description: 'Agreement recorded — AwardAgreementResult',
  })
  @ApiResponse({
    status: 400,
    description: 'VAL_AGREEMENT_DECLARATIONS_INCOMPLETE',
  })
  @ApiResponse({ status: 403, description: 'BIZ_AWARD_ACCEPTANCE_FORBIDDEN' })
  @ApiResponse({
    status: 404,
    description: 'RES_SCHOLARSHIP_AWARD_NOT_FOUND | RES_TERMS_VERSION_NOT_FOUND',
  })
  @ApiResponse({
    status: 409,
    description: 'BIZ_AWARD_AGREEMENT_ALREADY_EXISTS',
  })
  @ApiResponse({ status: 422, description: 'BIZ_AGREEMENT_NOT_ACCEPTED' })
  createAgreement(
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Body() dto: CreateAgreementDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.agreementService.createAgreement(awardId, actorId, dto);
  }

  // ── Staff read ─────────────────────────────────────────────────────────────

  /**
   * Retrieve the agreement for any award in the organization.
   *
   * GET /scholarships/awards/:awardId/agreement/staff
   *
   * Returns the full AwardAgreementResult including `signerIpAddress` and
   * all declaration timestamps.
   *
   * Returns:
   *   200  AwardAgreementResult
   *   404  RES_AWARD_AGREEMENT_NOT_FOUND
   */
  @Get(':awardId/agreement/staff')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Staff: retrieve agreement for any award (OWNER | ADMIN)',
    description:
      'Returns the full AwardAgreementResult, including signerIpAddress and ' +
      'declaration timestamps.  Scoped to the organization supplied via ' +
      '?organizationId=.',
  })
  @ApiResponse({ status: 200, description: 'AwardAgreementResult' })
  @ApiResponse({ status: 404, description: 'RES_AWARD_AGREEMENT_NOT_FOUND' })
  getAgreementStaff(
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Query() scope: AgreementScopeQueryDto,
  ) {
    return this.agreementService.getAgreement(
      awardId,
      scope.organizationId,
    );
  }

  // ── Integrity verification ─────────────────────────────────────────────────

  /**
   * Verify the termsSnapshotHash stored on an agreement.
   *
   * GET /scholarships/awards/:awardId/agreement/verify
   *
   * Recomputes the SHA-256 hash of the referenced ProgramTermsVersion document
   * and compares it to the value stored on the agreement.  Returns a
   * verification result rather than throwing so callers can log, alert, or
   * display the discrepancy as needed.
   *
   * Response shape:
   *   { valid: boolean; stored: string; expected: string }
   *
   * Returns:
   *   200  { valid, stored, expected }
   *   404  RES_AWARD_AGREEMENT_NOT_FOUND
   */
  @Get(':awardId/agreement/verify')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Staff: verify agreement hash integrity (OWNER | ADMIN)',
    description:
      'Recomputes the SHA-256 hash of the ProgramTermsVersion referenced by the ' +
      'agreement and compares it to the stored termsSnapshotHash.  ' +
      'Returns { valid: true } when they match, or { valid: false, stored, expected } ' +
      'when a discrepancy is detected.  Does NOT throw on mismatch — returns 200 ' +
      'with valid=false so callers can decide how to handle tampering alerts.',
  })
  @ApiResponse({
    status: 200,
    description: '{ valid: boolean; stored: string; expected: string }',
  })
  @ApiResponse({ status: 404, description: 'RES_AWARD_AGREEMENT_NOT_FOUND' })
  verifyAgreementHash(
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Query() scope: AgreementScopeQueryDto,
  ) {
    return this.agreementService.verifyAgreementHash(
      awardId,
      scope.organizationId,
    );
  }
}
