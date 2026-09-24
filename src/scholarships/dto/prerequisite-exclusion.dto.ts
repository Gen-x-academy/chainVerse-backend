import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PrerequisiteType } from '../schemas/program-prerequisite.schema';
import { ExclusionReasonCode, ExclusionType } from '../schemas/program-exclusion.schema';

export class AddPrerequisiteDto {
  @ApiProperty({ enum: PrerequisiteType, description: 'Type of prerequisite requirement' })
  @IsEnum(PrerequisiteType)
  prerequisiteType: PrerequisiteType;

  @ApiProperty({
    description: 'Opaque reference ID for the required achievement / course / scholarship',
  })
  @IsString()
  @MaxLength(200)
  referenceId: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ default: true, description: 'Hard-blocks application when true' })
  @IsBoolean()
  isRequired: boolean;
}

export class AddExclusionDto {
  @ApiProperty({ enum: ExclusionType, description: 'Category of exclusion condition' })
  @IsEnum(ExclusionType)
  exclusionType: ExclusionType;

  @ApiProperty({
    enum: ExclusionReasonCode,
    description: 'Stable machine-readable reason code used in all exclusion decisions',
  })
  @IsEnum(ExclusionReasonCode)
  reasonCode: ExclusionReasonCode;

  @ApiPropertyOptional({
    type: Object,
    description: 'Type-specific threshold parameters (no raw PII)',
  })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export interface ExclusionDecision {
  excluded: boolean;
  reasons: Array<{
    exclusionType: ExclusionType;
    reasonCode: ExclusionReasonCode;
    description: string;
  }>;
}

export interface PrerequisiteEvaluationResult {
  met: boolean;
  unmet: Array<{
    prerequisiteType: PrerequisiteType;
    referenceId: string;
    isRequired: boolean;
    description: string;
  }>;
}
