import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ScholarshipProgramStatus } from '../schemas/scholarship-program.schema';

export class OrgScopedQueryDto {
  @ApiProperty({ description: 'Owning organization id (tenant scope)' })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class CreateScholarshipProgramDto {
  @ApiProperty({ description: 'Owning organization id (tenant scope)' })
  @IsMongoId()
  organizationId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class ScholarshipProgramQueryDto extends OrgScopedQueryDto {
  @ApiPropertyOptional({ enum: ScholarshipProgramStatus })
  @IsOptional()
  @IsEnum(ScholarshipProgramStatus)
  status?: ScholarshipProgramStatus;
}

/**
 * Catalog search filters for `GET scholarships/programs` (#1175).
 *
 * Every field is optional and URL-backed, and every one narrows the same query
 * that produces `total` — a filter never changes what `total` counts. That is
 * what lets a client render "N results" and a pager without a second request.
 *
 * Filters are intentionally expressed against the denormalized projection on
 * `ScholarshipProgram` (`awardValue`, `awardCurrency`, `applicationDeadline`,
 * `fundingType`, `network`) rather than against `ProgramTermsVersion`, so a
 * search is a single indexed query instead of an aggregation with a `$lookup`.
 *
 * `closed` and `archived` programs are excluded by default: the catalog is a
 * discovery surface for things a student can still apply to. Pass
 * `includeClosed=true` to include them (staff audits, Receipts reconciliation).
 */
export class ScholarshipProgramSearchDto extends OrgScopedQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive text matched against the program title and description.',
    example: 'stellar',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ScholarshipProgramStatus })
  @IsOptional()
  @IsEnum(ScholarshipProgramStatus)
  status?: ScholarshipProgramStatus;

  @ApiPropertyOptional({ minimum: 0, description: 'Minimum award value, inclusive' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minAwardValue?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Maximum award value, inclusive' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxAwardValue?: number;

  @ApiPropertyOptional({ description: 'ISO 4217 currency code', example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  awardCurrency?: string;

  @ApiPropertyOptional({
    description: 'Only programs whose application deadline is on or before this date',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsISO8601()
  @Type(() => Date)
  deadlineBefore?: Date;

  @ApiPropertyOptional({
    description: 'Only programs whose application deadline is on or after this date',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsISO8601()
  @Type(() => Date)
  deadlineAfter?: Date;

  @ApiPropertyOptional({
    description: 'How the program is funded',
    enum: ['horizon', 'manual', 'deposit'],
  })
  @IsOptional()
  @IsEnum(['horizon', 'manual', 'deposit'] as const)
  fundingType?: 'horizon' | 'manual' | 'deposit';

  @ApiPropertyOptional({ description: 'Stellar network the program pays out on' })
  @IsOptional()
  @IsEnum(['testnet', 'public'] as const)
  network?: 'testnet' | 'public';

  @ApiPropertyOptional({
    description:
      'Include CLOSED and ARCHIVED programs. They are excluded by default so ' +
      'the catalog only surfaces programs a student can still apply to.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeClosed?: boolean = false;
}

/**
 * DTO for the PATCH /:programId/status endpoint (legacy, kept for backward
 * compatibility with pre-#1122 callers).  New callers should use
 * PATCH /:programId/transition which validates the state machine.
 */
export class UpdateScholarshipProgramStatusDto {
  @ApiProperty({ enum: ScholarshipProgramStatus })
  @IsEnum(ScholarshipProgramStatus)
  status: ScholarshipProgramStatus;
}

/**
 * DTO for the program lifecycle transition endpoint (issue #1122).
 *
 * Authorization notes:
 *   - Only OWNER or ADMIN of the owning organization may trigger transitions.
 *   - The `organizationId` is sourced from the query string and verified by
 *     `OrganizationRolesGuard` before the controller is invoked.
 *
 * Ownership / Tenant notes:
 *   - `organizationId` is supplied via `OrgScopedQueryDto` on the query string;
 *     this DTO carries only the desired target status.
 *   - The service rejects any attempt to transition a program belonging to a
 *     different tenant (getProgram enforces this via a scoped findOne).
 */
export class TransitionProgramStatusDto {
  @ApiProperty({
    enum: ScholarshipProgramStatus,
    description:
      'Target lifecycle status.  Must be reachable from the current status. ' +
      'Legal transitions: DRAFT→PUBLISHED, PUBLISHED→PAUSED, PAUSED→PUBLISHED, ' +
      'PUBLISHED→CLOSED, CLOSED→ARCHIVED.',
  })
  @IsEnum(ScholarshipProgramStatus)
  status: ScholarshipProgramStatus;
}
