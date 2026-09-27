import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AwardStatus } from '../schemas/scholarship-award.schema';

// ── Sub-DTOs ──────────────────────────────────────────────────────────────────

/**
 * A single disbursement milestone embedded in a create-award request.
 *
 * Business rules enforced by the service:
 *   - `amount` must be > 0.
 *   - When both `startsAt` and `endsAt` are supplied, `startsAt` must precede
 *     `endsAt` (VAL_AWARD_MILESTONE_DATE_INVALID).
 *   - The sum of all milestone amounts must not exceed the parent award's
 *     `amount` (service emits a warning but does not reject partial sums to
 *     accommodate phased-release scenarios).
 */
export class AwardMilestoneDto {
  @ApiProperty({
    description: 'Short title for this disbursement milestone.',
    example: 'Semester 1 disbursement',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: 'Optional longer description of the milestone conditions.',
    maxLength: 1000,
    example: 'Disbursed upon enrolment confirmation for the spring semester.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    description:
      'Monetary portion of the total award amount to be disbursed at this ' +
      'milestone.  Must be > 0.',
    example: 2500,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({
    description:
      'ISO-8601 start date of the milestone period.  When supplied alongside ' +
      '`endsAt`, must be strictly before `endsAt`.',
    example: '2027-01-15T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({
    description:
      'ISO-8601 end date of the milestone period.  Must be after `startsAt` ' +
      'when both fields are present.',
    example: '2027-06-30T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

// ── Create award ──────────────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/programs/:programId/applications/:applicationId/award`.
 *
 * Materializes an approved award record once the committee has resolved an
 * application to AWARDED and the organization confirms the grant.
 *
 * Authorization: OWNER or ADMIN.
 *
 * Business rules enforced by the service:
 *   - `applicationId` must exist and be owned by the given organization
 *     (RES_SCHOLARSHIP_APPLICATION_NOT_FOUND).
 *   - Only one award per application — returns 409 BIZ_AWARD_ALREADY_EXISTS
 *     if a non-terminal award already exists for this application.
 *   - The applicant must not already hold an active award (PENDING_ACCEPTANCE
 *     or ACCEPTED) within the same organization — returns 422 BIZ_AWARD_CONFLICT.
 *   - `acceptanceDeadline` must be a future timestamp
 *     (VAL_AWARD_ACCEPTANCE_DEADLINE_PAST).
 *   - When `milestones` is supplied, each milestone's `startsAt` must precede
 *     `endsAt` (VAL_AWARD_MILESTONE_DATE_INVALID).
 *   - When `reservationId` is supplied it must belong to the same organization
 *     and program (RES_BUDGET_RESERVATION_NOT_FOUND).
 */
export class CreateAwardDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;

  @ApiProperty({
    description:
      'Monetary value of the award.  Must be > 0.  Should match the ' +
      'linked budget reservation amount when `reservationId` is provided.',
    example: 5000,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({
    description:
      'ISO 4217 currency code.  Must match the program budget ledger ' +
      'currency when a reservation is linked.',
    example: 'USD',
    maxLength: 10,
  })
  @IsString()
  @MaxLength(10)
  currency: string;

  @ApiProperty({
    description:
      'Prose terms of the award: payment schedule narrative, conditions, ' +
      'and obligations the applicant agrees to upon acceptance.  ' +
      'Presented to the applicant before they accept.',
    example:
      'The award of USD 5,000 will be disbursed in two equal instalments. ' +
      'The recipient must maintain a GPA of 3.0 or above each semester.',
    maxLength: 5000,
  })
  @IsString()
  @MaxLength(5000)
  termsText: string;

  @ApiProperty({
    description:
      'ISO-8601 deadline by which the applicant must formally accept the ' +
      'offer.  Must be in the future.  After this timestamp the award ' +
      'transitions to OFFER_EXPIRED and any linked budget reservation is ' +
      'released back to available capacity.',
    example: '2027-03-31T23:59:59.000Z',
  })
  @IsDateString()
  acceptanceDeadline: string;

  @ApiPropertyOptional({
    description:
      'Structured disbursement milestones.  Omit for lump-sum awards.  ' +
      'Maximum 24 milestones per award.',
    type: [AwardMilestoneDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => AwardMilestoneDto)
  milestones?: AwardMilestoneDto[];

  @ApiPropertyOptional({
    description:
      'ObjectId of the BudgetReservation that backs this award.  ' +
      'When provided the service links the reservation so that accepting or ' +
      'expiring the award automatically transitions the reservation state.  ' +
      'Omit for unfunded / honorific awards.',
    example: '665f1b2c3d4e5f6a7b8c9d0f',
  })
  @IsOptional()
  @IsMongoId()
  reservationId?: string;
}

// ── Accept award ──────────────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/awards/:awardId/accept`.
 *
 * The applicant formally accepts the scholarship offer.
 *
 * Authorization: The authenticated user must be the applicant on this award
 *   (BIZ_AWARD_ACCEPTANCE_FORBIDDEN if not).
 *
 * Business rules enforced by the service:
 *   - Award must be in PENDING_ACCEPTANCE state (BIZ_AWARD_INVALID_STATE).
 *   - `acceptanceDeadline` must not have passed (BIZ_AWARD_OFFER_EXPIRED).
 *   - When a `reservationId` is linked the service transitions the reservation
 *     PENDING → CONFIRMED in the same logical operation.
 */
export class AcceptAwardDto {
  @ApiPropertyOptional({
    description:
      'Optional free-text note from the applicant (e.g. a thank-you message ' +
      'or a reference to their formal acceptance letter).  Stored for audit.',
    maxLength: 1000,
    example: 'I am honoured to accept this award and commit to its conditions.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

// ── Decline award ─────────────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/awards/:awardId/decline`.
 *
 * The applicant formally declines the scholarship offer.
 *
 * Authorization: The authenticated user must be the applicant on this award.
 *
 * Business rules enforced by the service:
 *   - Award must be in PENDING_ACCEPTANCE state (BIZ_AWARD_INVALID_STATE).
 *   - When a `reservationId` is linked the service cancels the reservation
 *     (PENDING → CANCELLED).
 */
export class DeclineAwardDto {
  @ApiPropertyOptional({
    description: 'Optional reason the applicant is declining the offer.',
    maxLength: 1000,
    example: 'I have accepted a different scholarship offer.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

// ── Rescind award ─────────────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/awards/:awardId/rescind`.
 *
 * An organization OWNER rescinds an ACCEPTED award.
 *
 * Authorization: OWNER only.
 *
 * Business rules enforced by the service:
 *   - Award must be in ACCEPTED state (BIZ_AWARD_INVALID_STATE).
 *   - `reason` is mandatory for audit/compliance.
 *   - When a `reservationId` is linked the service releases the reservation
 *     (CONFIRMED → RELEASED), restoring the budget capacity.
 */
export class RescindAwardDto {
  @ApiProperty({
    description:
      'Mandatory reason for rescinding the award.  Stored in the audit ' +
      'trail and on the award document for compliance.',
    maxLength: 1000,
    example: 'Applicant no longer meets the eligibility criteria.',
  })
  @IsString()
  @MaxLength(1000)
  reason: string;
}

// ── Query DTOs ────────────────────────────────────────────────────────────────

/**
 * Shared query parameters for award endpoints that require tenant scoping.
 */
export class AwardScopeQueryDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;
}

/**
 * Query parameters for the program-level award list endpoint.
 *
 * `GET /scholarships/programs/:programId/awards`
 */
export class ListAwardsQueryDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({
    enum: AwardStatus,
    description:
      'Filter by award status.  Omit to return all awards for the program.',
    example: AwardStatus.PENDING_ACCEPTANCE,
  })
  @IsOptional()
  @IsEnum(AwardStatus)
  status?: AwardStatus;

  @ApiPropertyOptional({
    description: 'Page number (1-indexed).',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page.  Maximum 100.',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

// ── Response shapes ───────────────────────────────────────────────────────────

/** Serialized milestone returned inside AwardResult. */
export interface AwardMilestoneResult {
  milestoneId: string;
  title: string;
  description?: string;
  amount: number;
  startsAt: string | null;
  endsAt: string | null;
}

/**
 * Full award payload returned by the service to the controller.
 *
 * Privacy notes:
 *   - `termsText` contains legally sensitive conditions; restrict to
 *     OWNER/ADMIN and the award's own applicant.
 *   - `rescissionReason` and `statusHistory` are staff-only; never return to
 *     other applicants.
 *   - Applicants receive only their own award via the acceptance endpoints.
 */
export interface AwardResult {
  awardId: string;
  organizationId: string;
  programId: string;
  applicationId: string;
  applicantId: string;
  reservationId: string | null;
  amount: number;
  currency: string;
  termsText: string;
  milestones: AwardMilestoneResult[];
  acceptanceDeadline: string;
  status: AwardStatus;
  respondedAt: string | null;
  applicantNote: string | null;
  rescindedAt: string | null;
  rescindedBy: string | null;
  rescissionReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
