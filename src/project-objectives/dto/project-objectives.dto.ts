import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ObjectiveDirection,
  ObjectivePriority,
  ObjectiveProjectRole,
  ObjectiveStatus,
  ObjectiveVisibility,
} from '../project-objectives.types';

export class MutationDto {
  @ApiProperty({
    description:
      'Client-generated retry key scoped to tenant, actor and action. Same key + same payload ' +
      'replays the original response; same key + different payload returns 409.',
    pattern: '^[A-Za-z0-9._-]{8,128}$',
    example: 'objective-create-001',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey!: string;
}

export class RegisterObjectivesProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  projectId!: string;

  @ApiPropertyOptional({
    description:
      'Map of user id to project role (owner, planner, reviewer, viewer).',
    example: { 'user-1': 'owner' },
  })
  @IsOptional()
  @IsObject()
  members?: Record<string, ObjectiveProjectRole>;
}

export class CriterionInputDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @ApiProperty({
    description:
      'Metric value to reach (>= when increasing, <= when decreasing). Must lie between baseline and target.',
  })
  @IsNumber()
  threshold!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

class ObjectiveDefinitionDto extends MutationDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ enum: ObjectivePriority })
  @IsEnum(ObjectivePriority)
  priority!: ObjectivePriority;

  @ApiProperty({
    description: 'User id of the objective owner; must be a project member.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  ownerId!: string;

  @ApiProperty({ example: '%', maxLength: 32 })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit!: string;

  @ApiProperty({ enum: ObjectiveDirection })
  @IsEnum(ObjectiveDirection)
  direction!: ObjectiveDirection;

  @ApiProperty()
  @IsNumber()
  @Min(-1e12)
  @Max(1e12)
  baseline!: number;

  @ApiProperty()
  @IsNumber()
  @Min(-1e12)
  @Max(1e12)
  target!: number;

  @ApiProperty({ example: '2027-01-15' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2027-06-30' })
  @IsDateString()
  targetDate!: string;

  @ApiProperty({ enum: ObjectiveVisibility })
  @IsEnum(ObjectiveVisibility)
  visibility!: ObjectiveVisibility;

  @ApiPropertyOptional({
    description:
      'Opaque charter reference. Required before the objective can be activated.',
    pattern: '^[A-Za-z0-9._:-]{2,128}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{2,128}$/)
  charterReference?: string;

  @ApiPropertyOptional({
    type: [CriterionInputDto],
    description: 'Replaces the full criteria list.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CriterionInputDto)
  criteria?: CriterionInputDto[];
}

export class CreateObjectiveDto extends ObjectiveDefinitionDto {}

export class UpdateObjectiveDto extends ObjectiveDefinitionDto {
  @ApiProperty({
    description: 'Version the caller last saw; a mismatch returns 409.',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class TransitionObjectiveDto extends MutationDto {
  @ApiProperty({ enum: ObjectiveStatus })
  @IsEnum(ObjectiveStatus)
  status!: ObjectiveStatus;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class RecordProgressDto extends MutationDto {
  @ApiProperty({ description: 'Current measured value of the metric.' })
  @IsNumber()
  @Min(-1e12)
  @Max(1e12)
  value!: number;
}
