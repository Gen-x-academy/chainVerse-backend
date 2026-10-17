import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ReservationStatus } from '../schemas/budget-reservation.schema';

// ── Initialise ledger ─────────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/programs/:programId/budget`.
 *
 * Creates the program's budget ledger, setting the total capacity that will
 * cap all future reservations.  A ledger may only be created once per program
 * (subsequent calls return 409 BIZ_RESERVATION_ALREADY_EXISTS).
 *
 * Authorization: OWNER only.
 *
 * Business rules enforced by the service:
 *   - `totalBudget` must be ≥ 0.
 *   - `currency` must be a valid ISO 4217 code (format validated here; ISO
 *     membership is not exhaustively checked server-side).
 */
export class InitialiseLedgerDto {
  @ApiProperty({
    description:
      'Total monetary capacity of this scholarship program.  All active ' +
      '(PENDING + CONFIRMED) reservations must not exceed this figure.',
    example: 50000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  totalBudget: number;

  @ApiProperty({
    description: 'ISO 4217 currency code for all amounts on this ledger.',
    example: 'USD',
    maxLength: 10,
  })
  @IsString()
  @MaxLength(10)
  currency: string;
}

/**
 * Body DTO for `PATCH /scholarships/programs/:programId/budget`.
 *
 * Increases or decreases the program's total budget capacity.
 *
 * Authorization: OWNER only.
 *
 * Business rules enforced by the service:
 *   - `totalBudget` must be ≥ 0.
 *   - The new value must not drop below `reservedAmount + disbursedAmount`
 *     (cannot shrink below already-committed funds).
 */
export class UpdateLedgerDto {
  @ApiProperty({
    description:
      'New total budget capacity.  Must be ≥ reservedAmount + disbursedAmount.',
    example: 60000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  totalBudget: number;
}

// ── Create reservation ────────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/programs/:programId/applications/:applicationId/budget-reservation`.
 *
 * Atomically reserves a portion of the program budget when an award decision
 * is approved.  The service creates a PENDING reservation and increments
 * BudgetLedger.reservedAmount in a single conditional update; if available
 * budget is insufficient the whole operation is aborted (BIZ_BUDGET_INSUFFICIENT).
 *
 * Authorization: OWNER or ADMIN.
 *
 * Business rules enforced by the service:
 *   - The program budget ledger must exist (RES_BUDGET_LEDGER_NOT_FOUND).
 *   - The application must exist and be owned by this organization.
 *   - No active (PENDING or CONFIRMED) reservation may already exist for this
 *     application (BIZ_RESERVATION_ALREADY_EXISTS).
 *   - `amount` must be > 0 and must not exceed available budget
 *     (totalBudget − reservedAmount − disbursedAmount).
 *   - `expiresAt` must be a future timestamp (VAL_RESERVATION_INVALID_EXPIRY).
 */
export class CreateReservationDto {
  @ApiProperty({
    description:
      'Monetary amount to hold from the program budget.  Must be > 0 and ' +
      'must not exceed available budget (totalBudget − reservedAmount − disbursedAmount).',
    example: 5000,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({
    description:
      'ISO 4217 currency code.  Must match the program ledger currency.',
    example: 'USD',
    maxLength: 10,
  })
  @IsString()
  @MaxLength(10)
  currency: string;

  @ApiProperty({
    description:
      'ISO-8601 datetime by which the applicant must accept the award.  ' +
      'After this timestamp the reservation is automatically expired by the ' +
      'scheduled job and the held amount is returned to available budget.  ' +
      'Must be in the future.',
    example: '2026-12-31T23:59:59.000Z',
  })
  @IsDateString()
  expiresAt: string;
}

// ── Confirm reservation ───────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/programs/:programId/applications/:applicationId/budget-reservation/confirm`.
 *
 * Transitions a PENDING reservation to CONFIRMED, indicating the applicant has
 * accepted the award.  Atomically moves `amount` from `reservedAmount` to
 * `disbursedAmount` on the ledger.
 *
 * Authorization: OWNER or ADMIN.
 *
 * Business rules enforced by the service:
 *   - Reservation must exist and be PENDING (BIZ_RESERVATION_INVALID_STATE if
 *     already CONFIRMED; BIZ_RESERVATION_ALREADY_RELEASED / BIZ_RESERVATION_INVALID_STATE
 *     for terminal states).
 */
export class ConfirmReservationDto {
  @ApiPropertyOptional({
    description:
      'Optional note recorded alongside the confirmation (e.g. acceptance ' +
      'reference number).  Stored in the `reason` field for audit purposes.',
    maxLength: 500,
    example: 'Applicant signed acceptance form REF-2026-001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ── Cancel reservation ────────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/programs/:programId/applications/:applicationId/budget-reservation/cancel`.
 *
 * Cancels a PENDING reservation, returning the held amount to available budget.
 *
 * Authorization: OWNER or ADMIN.
 *
 * Business rules enforced by the service:
 *   - Reservation must be PENDING (BIZ_RESERVATION_ALREADY_CONFIRMED for
 *     CONFIRMED; BIZ_RESERVATION_INVALID_STATE for other terminal states).
 *   - `reason` is mandatory so the audit trail captures intent.
 */
export class CancelReservationDto {
  @ApiProperty({
    description:
      'Mandatory reason for cancelling the reservation.  Stored for audit.',
    maxLength: 500,
    example: 'Award withdrawn due to applicant eligibility change.',
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}

// ── Release reservation ───────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/programs/:programId/applications/:applicationId/budget-reservation/release`.
 *
 * Releases a CONFIRMED reservation (award rescinded after acceptance).
 * Atomically decrements `disbursedAmount` on the ledger, restoring capacity.
 *
 * Authorization: OWNER only.
 *
 * Business rules enforced by the service:
 *   - Reservation must be CONFIRMED (BIZ_RESERVATION_ALREADY_RELEASED for
 *     RELEASED; BIZ_RESERVATION_INVALID_STATE for other states).
 *   - `reason` is mandatory.
 */
export class ReleaseReservationDto {
  @ApiProperty({
    description:
      'Mandatory reason for releasing the confirmed reservation.  Stored for audit.',
    maxLength: 500,
    example: 'Applicant declined award after acceptance due to conflict of interest.',
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}

// ── Query DTOs ────────────────────────────────────────────────────────────────

/**
 * Query parameters shared by all budget-reservation endpoints that require
 * tenant scoping.
 */
export class BudgetScopeQueryDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;
}

/**
 * Query parameters for the program-level reservation list endpoint.
 *
 * `GET /scholarships/programs/:programId/budget-reservations`
 */
export class ListReservationsQueryDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({
    enum: ReservationStatus,
    description: 'Filter by reservation status.  Omit to return all.',
    example: ReservationStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional({
    description: 'Maximum number of results to return (default 50, max 200).',
    example: 50,
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

// ── Response shapes ───────────────────────────────────────────────────────────

/**
 * Budget ledger summary returned by ledger read/create/update endpoints.
 *
 * Privacy: Internal financial data — never expose to applicants.
 */
export interface BudgetLedgerResult {
  ledgerId: string;
  organizationId: string;
  programId: string;
  totalBudget: number;
  reservedAmount: number;
  disbursedAmount: number;
  /** Computed: totalBudget − reservedAmount − disbursedAmount */
  availableBudget: number;
  currency: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Single reservation payload returned by reservation endpoints.
 *
 * Privacy: Internal financial data — never expose to applicants.
 */
export interface BudgetReservationResult {
  reservationId: string;
  organizationId: string;
  programId: string;
  applicationId: string;
  amount: number;
  currency: string;
  status: ReservationStatus;
  expiresAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  reason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
