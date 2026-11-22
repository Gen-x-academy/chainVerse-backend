import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CapacityScope } from '../capacity.constants';

/** Defines (or redefines, with a new version) the limits for a scope. */
export class DefineCapacityPolicyDto {
  @ApiProperty({ enum: CapacityScope })
  @IsEnum(CapacityScope)
  scope!: CapacityScope;

  @ApiPropertyOptional({
    description: 'Program or mentor id. Required unless scope is `global`.',
    maxLength: 128,
  })
  @ValidateIf((o: DefineCapacityPolicyDto) => o.scope !== CapacityScope.GLOBAL)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  targetId?: string;

  @ApiProperty({ description: 'Maximum concurrent active engagements.', minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrentEngagements!: number;

  @ApiProperty({ description: 'Maximum weekly mentoring hours.', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxWeeklyHours!: number;

  @ApiProperty({ description: 'Maximum distinct programs a mentor may serve.', minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  maxPrograms!: number;

  @ApiProperty({ description: 'Maximum cohorts per program.', minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  maxCohortsPerProgram!: number;

  @ApiProperty({ description: 'Reserved (unconfirmed) proposal slots.', minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  reservedProposalCapacity!: number;

  @ApiPropertyOptional({ description: 'Pauses all new reservations for this scope.' })
  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @ApiPropertyOptional({ description: 'Why the scope is paused (private to staff).', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pauseReason?: string;

  @ApiPropertyOptional({
    description: 'Pause automatically stops applying after this instant.',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  pauseExpiresAt?: string;

  @ApiProperty({ description: 'Version the caller last read; guards stale writes.', minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

/** Read-only inspection of a mentor's calculation (staff only). */
export class InspectAllocationQueryDto {
  @ApiPropertyOptional({ description: 'Narrow the calculation to one program.', maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  programId?: string;
}

/** Reserves one proposal slot against the effective policy. */
export class ReserveCapacityDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  proposalId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  mentorId!: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  programId?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  cohortId?: string;

  @ApiProperty({ description: 'Weekly hours this engagement will consume.', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weeklyHours!: number;

  @ApiProperty({ description: 'When the unconfirmed reservation expires.', format: 'date-time' })
  @IsDateString()
  expiresAt!: string;

  @ApiProperty({
    description: 'Unique per reservation; resending the same key is a no-op.',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @Length(8, 64)
  idempotencyKey!: string;
}

/** Bounded sweeper request for expiring stale reservations. */
export class ExpireReservationsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
