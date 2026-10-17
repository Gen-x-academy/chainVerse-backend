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
import { BudgetReservationService } from '../services/budget-reservation.service';
import {
  BudgetScopeQueryDto,
  CancelReservationDto,
  ConfirmReservationDto,
  CreateReservationDto,
  InitialiseLedgerDto,
  ListReservationsQueryDto,
  ReleaseReservationDto,
  UpdateLedgerDto,
} from '../dto/budget-reservation.dto';

/**
 * Budget reservation endpoints for the scholarship awards workflow.
 *
 * Route structure:
 *
 *   Ledger management (OWNER only):
 *     POST   /scholarships/programs/:programId/budget
 *            → Initialise budget ledger for a program
 *     PATCH  /scholarships/programs/:programId/budget
 *            → Update total budget capacity
 *     GET    /scholarships/programs/:programId/budget
 *            → Get current ledger summary (OWNER | ADMIN)
 *
 *   Per-application reservations:
 *     POST   /scholarships/programs/:programId/applications/:applicationId/budget-reservation
 *            → Create (PENDING) reservation on award decision (OWNER | ADMIN)
 *     POST   /scholarships/programs/:programId/applications/:applicationId/budget-reservation/confirm
 *            → Confirm reservation when applicant accepts (OWNER | ADMIN)
 *     POST   /scholarships/programs/:programId/applications/:applicationId/budget-reservation/cancel
 *            → Cancel PENDING reservation (OWNER | ADMIN)
 *     POST   /scholarships/programs/:programId/applications/:applicationId/budget-reservation/release
 *            → Release CONFIRMED reservation (OWNER only)
 *     GET    /scholarships/programs/:programId/applications/:applicationId/budget-reservation
 *            → Get active reservation for an application (OWNER | ADMIN)
 *
 *   Program-level list:
 *     GET    /scholarships/programs/:programId/budget-reservations
 *            → List all reservations for a program (OWNER | ADMIN)
 *
 * Authorization model:
 *   - All routes require a valid JWT (JwtAuthGuard) and organization membership
 *     (OrganizationRolesGuard).  `organizationId` is always sourced from the
 *     query string so the guard verifies membership before any handler runs.
 *   - Ledger initialisation and release are restricted to OWNER.
 *   - All other mutations are open to OWNER and ADMIN.
 *   - Read endpoints are open to OWNER and ADMIN.
 *
 * Tenant isolation:
 *   The guard resolves `organizationId` from the query string and verifies
 *   membership before any handler runs.  The service performs a second
 *   ownership check on every query.
 *
 * Privacy:
 *   Budget figures and reservation amounts are internal financial data.
 *   Do not expose these endpoints to applicants.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Budget Reservations')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/programs/:programId')
export class BudgetReservationController {
  constructor(
    private readonly reservationService: BudgetReservationService,
  ) {}

  // ── Ledger ─────────────────────────────────────────────────────────────────

  /**
   * Initialise the budget ledger for a scholarship program.
   *
   * POST /scholarships/programs/:programId/budget
   *
   * Creates the per-program budget ledger that gates all future reservations.
   * Exactly one ledger per program; subsequent calls return 409.
   *
   * Authorization: OWNER only.
   */
  @Post('budget')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER)
  @ApiOperation({
    summary: 'Initialise budget ledger for a scholarship program (OWNER only)',
    description:
      'Creates the per-program budget ledger.  Exactly one ledger per ' +
      'program — returns 409 if one already exists.  Set totalBudget to the ' +
      'maximum monetary value that may be held across all reservations.',
  })
  @ApiResponse({ status: 201, description: 'Ledger created — BudgetLedgerResult' })
  @ApiResponse({ status: 409, description: 'BIZ_RESERVATION_ALREADY_EXISTS' })
  initialiseLedger(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: BudgetScopeQueryDto,
    @Body() dto: InitialiseLedgerDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.reservationService.initialiseLedger(
      scope.organizationId,
      programId,
      dto,
      actorId,
    );
  }

  /**
   * Update the total budget capacity of an existing ledger.
   *
   * PATCH /scholarships/programs/:programId/budget
   *
   * The new `totalBudget` must be ≥ currently committed funds
   * (reservedAmount + disbursedAmount).
   *
   * Authorization: OWNER only.
   */
  @Patch('budget')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER)
  @ApiOperation({
    summary: 'Update total budget capacity (OWNER only)',
    description:
      'Sets a new totalBudget on the ledger.  Cannot be reduced below ' +
      'reservedAmount + disbursedAmount (already-committed funds).',
  })
  @ApiResponse({ status: 200, description: 'Ledger updated — BudgetLedgerResult' })
  @ApiResponse({ status: 404, description: 'RES_BUDGET_LEDGER_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'VAL_BUDGET_AMOUNT_INVALID' })
  updateLedger(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: BudgetScopeQueryDto,
    @Body() dto: UpdateLedgerDto,
  ) {
    return this.reservationService.updateLedger(
      scope.organizationId,
      programId,
      dto,
    );
  }

  /**
   * Get the current budget ledger summary for a program.
   *
   * GET /scholarships/programs/:programId/budget
   *
   * Returns totalBudget, reservedAmount, disbursedAmount, and the computed
   * availableBudget.  Staff-only — never expose to applicants.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Get('budget')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Get budget ledger summary for a program (OWNER | ADMIN)',
    description:
      'Returns totalBudget, reservedAmount, disbursedAmount, and computed ' +
      'availableBudget.  Internal financial data — do not expose to applicants.',
  })
  @ApiResponse({ status: 200, description: 'BudgetLedgerResult' })
  @ApiResponse({ status: 404, description: 'RES_BUDGET_LEDGER_NOT_FOUND' })
  getLedger(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: BudgetScopeQueryDto,
  ) {
    return this.reservationService.getLedger(scope.organizationId, programId);
  }

  // ── Per-application reservation ────────────────────────────────────────────

  /**
   * Create a PENDING budget reservation for an awarded application.
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/budget-reservation
   *
   * Atomically increments `reservedAmount` on the ledger by `dto.amount`.
   * Returns 422 BIZ_BUDGET_INSUFFICIENT if available budget would be exceeded.
   * Returns 409 BIZ_RESERVATION_ALREADY_EXISTS if an active reservation already
   * exists for this application.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Post('applications/:applicationId/budget-reservation')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Reserve budget for an awarded application (OWNER | ADMIN)',
    description:
      'Creates a PENDING reservation holding `amount` from the program ' +
      'budget.  Atomic: if available budget is insufficient the request is ' +
      'rejected (BIZ_BUDGET_INSUFFICIENT) without creating the reservation.  ' +
      'Only one active reservation per application is allowed (409 if one exists).',
  })
  @ApiResponse({ status: 201, description: 'Reservation created — BudgetReservationResult' })
  @ApiResponse({ status: 404, description: 'RES_BUDGET_LEDGER_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'BIZ_RESERVATION_ALREADY_EXISTS' })
  @ApiResponse({ status: 422, description: 'BIZ_BUDGET_INSUFFICIENT | VAL_RESERVATION_INVALID_EXPIRY' })
  createReservation(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: BudgetScopeQueryDto,
    @Body() dto: CreateReservationDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.reservationService.createReservation(
      scope.organizationId,
      programId,
      applicationId,
      dto,
      actorId,
    );
  }

  /**
   * Confirm a PENDING reservation (applicant accepted the award).
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/budget-reservation/confirm
   *
   * Moves `amount` from `reservedAmount` to `disbursedAmount` on the ledger.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Post('applications/:applicationId/budget-reservation/confirm')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Confirm a PENDING reservation when the applicant accepts (OWNER | ADMIN)',
    description:
      'Transitions status PENDING → CONFIRMED and moves the reserved ' +
      'amount to disbursedAmount on the ledger.',
  })
  @ApiResponse({ status: 201, description: 'Reservation confirmed — BudgetReservationResult' })
  @ApiResponse({ status: 404, description: 'RES_BUDGET_RESERVATION_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'BIZ_RESERVATION_INVALID_STATE' })
  confirmReservation(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: BudgetScopeQueryDto,
    @Body() dto: ConfirmReservationDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.reservationService.confirmReservation(
      scope.organizationId,
      programId,
      applicationId,
      dto,
      actorId,
    );
  }

  /**
   * Cancel a PENDING reservation.
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/budget-reservation/cancel
   *
   * Returns the held amount to available budget.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Post('applications/:applicationId/budget-reservation/cancel')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Cancel a PENDING reservation (OWNER | ADMIN)',
    description:
      'Transitions status PENDING → CANCELLED and decrements ' +
      'reservedAmount on the ledger.  Mandatory `reason` field required.  ' +
      'Returns 422 if the reservation is already CONFIRMED or in a terminal state.',
  })
  @ApiResponse({ status: 201, description: 'Reservation cancelled — BudgetReservationResult' })
  @ApiResponse({ status: 404, description: 'RES_BUDGET_RESERVATION_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'BIZ_RESERVATION_ALREADY_CONFIRMED | BIZ_RESERVATION_INVALID_STATE' })
  cancelReservation(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: BudgetScopeQueryDto,
    @Body() dto: CancelReservationDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.reservationService.cancelReservation(
      scope.organizationId,
      programId,
      applicationId,
      dto,
      actorId,
    );
  }

  /**
   * Release a CONFIRMED reservation (award rescinded after acceptance).
   *
   * POST /scholarships/programs/:programId/applications/:applicationId/budget-reservation/release
   *
   * Decrements `disbursedAmount`, restoring capacity.  May be done exactly
   * once — subsequent release attempts return 422 BIZ_RESERVATION_ALREADY_RELEASED.
   *
   * Authorization: OWNER only.
   */
  @Post('applications/:applicationId/budget-reservation/release')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER)
  @ApiOperation({
    summary: 'Release a CONFIRMED reservation (OWNER only)',
    description:
      'Transitions status CONFIRMED → RELEASED and decrements ' +
      'disbursedAmount on the ledger, restoring capacity.  Exactly once: ' +
      'subsequent calls return BIZ_RESERVATION_ALREADY_RELEASED.  ' +
      'Mandatory `reason` required.',
  })
  @ApiResponse({ status: 201, description: 'Reservation released — BudgetReservationResult' })
  @ApiResponse({ status: 404, description: 'RES_BUDGET_RESERVATION_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'BIZ_RESERVATION_ALREADY_RELEASED | BIZ_RESERVATION_INVALID_STATE' })
  releaseReservation(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: BudgetScopeQueryDto,
    @Body() dto: ReleaseReservationDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.reservationService.releaseReservation(
      scope.organizationId,
      programId,
      applicationId,
      dto,
      actorId,
    );
  }

  /**
   * Get the active reservation for an application.
   *
   * GET /scholarships/programs/:programId/applications/:applicationId/budget-reservation
   *
   * Returns the PENDING or CONFIRMED reservation for the application, or 404
   * if no active reservation exists.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Get('applications/:applicationId/budget-reservation')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Get the active reservation for an application (OWNER | ADMIN)',
    description:
      'Returns the PENDING or CONFIRMED BudgetReservationResult for the ' +
      'application.  Returns 404 if no active reservation exists.',
  })
  @ApiResponse({ status: 200, description: 'BudgetReservationResult' })
  @ApiResponse({ status: 404, description: 'RES_BUDGET_RESERVATION_NOT_FOUND' })
  getReservation(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Query() scope: BudgetScopeQueryDto,
  ) {
    return this.reservationService.getReservation(
      scope.organizationId,
      programId,
      applicationId,
    );
  }

  // ── Program-level list ─────────────────────────────────────────────────────

  /**
   * List all reservations for a program.
   *
   * GET /scholarships/programs/:programId/budget-reservations
   *
   * Returns up to 200 BudgetReservationResult entries sorted by `createdAt`
   * descending.  Filter by `status` to narrow results.
   *
   * Authorization: OWNER or ADMIN.
   */
  @Get('budget-reservations')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'List all reservations for a program (OWNER | ADMIN)',
    description:
      'Returns BudgetReservationResult[] sorted by createdAt desc.  ' +
      'Optional `status` filter (pending | confirmed | expired | cancelled | released).  ' +
      'Optional `limit` (default 50, max 200).',
  })
  @ApiResponse({ status: 200, description: 'Array of BudgetReservationResult' })
  listReservations(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() query: ListReservationsQueryDto,
  ) {
    return this.reservationService.listReservations(programId, query);
  }
}
