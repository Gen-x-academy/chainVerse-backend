import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PackageStatus, WeightUnit, WbsRole } from '../work-breakdown.types';

/** All mutating DTOs carry an idempotency key. */
export class WbsMutationDto {
  @ApiProperty({
    description: 'Client-generated retry key scoped to tenant, actor, action',
    pattern: '^[A-Za-z0-9._-]{8,128}$',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey!: string;
}

// ── WBS ──────────────────────────────────────────────────────────────────────

export class CreateWbsDto extends WbsMutationDto {
  @ApiProperty({ description: 'Project this WBS belongs to', minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  projectId!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateWbsDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Full ordered package ID list; must reference all existing packages',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(500)
  orderedPackages?: string[];
}

// ── Work Package ──────────────────────────────────────────────────────────────

export class CreateWorkPackageDto extends WbsMutationDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Package IDs this package depends on',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(50)
  dependsOn?: string[];

  @ApiPropertyOptional({
    description: 'User IDs assigned to this package',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(50)
  assignees?: string[];

  @ApiPropertyOptional({
    description: 'Acceptance criteria (plain text entries)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  acceptanceCriteria?: string[];

  @ApiPropertyOptional({
    description: 'Progress weight 0–100 (default 1)',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressWeight?: number;
}

export class UpdateWorkPackageDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(50)
  assignees?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  acceptanceCriteria?: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressWeight?: number;
}

export class AdvancePackageStatusDto extends WbsMutationDto {
  @ApiProperty({ enum: PackageStatus, description: 'Target lifecycle status' })
  @IsEnum(PackageStatus)
  status!: PackageStatus;

  @ApiPropertyOptional({
    description: 'Required when transitioning to BLOCKED; explains the blocker',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  blockerNote?: string;
}

export class SetEstimateDto extends WbsMutationDto {
  @ApiProperty({ description: 'Effort estimate value', minimum: 0 })
  @IsInt()
  @Min(0)
  value!: number;

  @ApiProperty({ enum: WeightUnit })
  @IsEnum(WeightUnit)
  unit!: WeightUnit;
}

export class AssignRoleDto extends WbsMutationDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  userId!: string;

  @ApiProperty({ enum: WbsRole })
  @IsEnum(WbsRole)
  role!: WbsRole;
}

// ── Dependency ────────────────────────────────────────────────────────────────

export class AddDependencyDto extends WbsMutationDto {
  @ApiProperty({ description: 'Package that must complete first', minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  fromPackageId!: string;

  @ApiProperty({ description: 'Package that is blocked until predecessor completes', minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  toPackageId!: string;
}

// ── Task ─────────────────────────────────────────────────────────────────────

export class CreateTaskDto extends WbsMutationDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional({ description: 'Assignee user ID', maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 due date' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
