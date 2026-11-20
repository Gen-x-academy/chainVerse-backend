import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
import {
  ExtensionStatus,
  PlanningRole,
  RiskLikelihood,
  RiskSeverity,
} from '../project-planning.types';

export class MutationDto {
  @ApiProperty({
    description:
      'Client-generated retry key, scoped to tenant, actor and action',
    pattern: '^[A-Za-z0-9._-]{8,128}$',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey!: string;
}

export class CreateProjectDto extends MutationDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'ISO-8601 deadline for the project' })
  @IsDateString()
  deadline!: string;
}

export class AddProjectMemberDto extends MutationDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  userId!: string;

  @ApiProperty({ enum: PlanningRole })
  @IsEnum(PlanningRole)
  role!: PlanningRole;
}

export class CreateObjectiveDto extends MutationDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}

export class RecordCheckInDto extends MutationDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  percentage!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    description:
      'Required whenever the percentage is lower than the previous check-in',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  regressionReason?: string;
}

export class CreateRiskDto extends MutationDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ enum: RiskSeverity })
  @IsEnum(RiskSeverity)
  severity!: RiskSeverity;

  @ApiProperty({ enum: RiskLikelihood })
  @IsEnum(RiskLikelihood)
  likelihood!: RiskLikelihood;
}

export class AddMitigationDto extends MutationDto {
  @ApiProperty({
    description: 'Owner of the mitigation',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  ownerId!: string;

  @ApiProperty({ description: 'Private mitigation plan', maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  plan!: string;
}

export class CreatePhaseDto extends MutationDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'ISO-8601 phase start date' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: 'ISO-8601 phase end date, after startDate' })
  @IsDateString()
  endDate!: string;
}

export class RequestExtensionDto extends MutationDto {
  @ApiProperty({ minimum: 1, maximum: 90 })
  @IsInt()
  @Min(1)
  @Max(90)
  requestedDays!: number;

  @ApiProperty({
    description: 'Private justification for the extension',
    maxLength: 2000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class DecideExtensionDto extends MutationDto {
  @ApiProperty({ enum: ExtensionStatus })
  @IsEnum([ExtensionStatus.APPROVED, ExtensionStatus.REJECTED])
  decision!: ExtensionStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
