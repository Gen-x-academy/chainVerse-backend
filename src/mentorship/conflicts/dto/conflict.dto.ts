import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ConflictSeverity } from '../conflict.constants';

/** A relationship declared by a participant. `note` is private to staff. */
export class DeclaredRelationshipDto {
  @ApiProperty({ maxLength: 64, example: 'family' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  kind!: string;

  @ApiProperty({ enum: ConflictSeverity })
  @IsEnum(ConflictSeverity)
  severity!: ConflictSeverity;

  @ApiProperty({ description: 'Private detail — never exposed to other participants.', maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note!: string;
}

/** Facts used by the deterministic conflict evaluator. */
export class ConflictFactsDto {
  @ApiPropertyOptional({ description: 'Shared organization id, when known.', maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sharedOrganizationId?: string;

  @ApiPropertyOptional({ description: 'Mentor reports to the mentee (or vice versa).' })
  @IsOptional()
  @IsBoolean()
  reportingRelationship?: boolean;

  @ApiPropertyOptional({ description: 'Mentor reviews the mentee’s work.' })
  @IsOptional()
  @IsBoolean()
  reviewRelationship?: boolean;

  @ApiPropertyOptional({ description: 'A financial relationship exists.' })
  @IsOptional()
  @IsBoolean()
  financialRelationship?: boolean;

  @ApiPropertyOptional({ type: [DeclaredRelationshipDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeclaredRelationshipDto)
  declaredRelationships?: DeclaredRelationshipDto[];
}

export class RunConflictCheckDto {
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

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  menteeId!: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  programId?: string;

  @ApiProperty({ type: ConflictFactsDto })
  @ValidateNested()
  @Type(() => ConflictFactsDto)
  facts!: ConflictFactsDto;

  @ApiProperty({ description: 'Unique per check; resending the same key is a no-op.', minLength: 8, maxLength: 64 })
  @IsString()
  @Length(8, 64)
  idempotencyKey!: string;
}

export class RequestWaiverDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  checkId!: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  findingCode!: string;

  @ApiProperty({ description: 'Private justification, visible only to staff.', maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  @ApiProperty({ minLength: 8, maxLength: 64 })
  @IsString()
  @Length(8, 64)
  idempotencyKey!: string;
}

export class DecideWaiverDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Private decision note.', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote?: string;

  @ApiProperty({ description: 'Latest waiver version the caller read.', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
