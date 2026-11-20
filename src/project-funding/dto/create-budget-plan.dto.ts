import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BudgetCategory, ProjectFundingRole } from '../entities';

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export class BudgetLineDto {
  @ApiProperty({ example: 'line-1' })
  @IsString()
  @Matches(ID_PATTERN)
  id: string;

  @ApiProperty({ enum: BudgetCategory, example: BudgetCategory.EQUIPMENT })
  @IsEnum(BudgetCategory)
  category: BudgetCategory;

  @ApiProperty({
    example: 'Two rugged laptops for field data collection',
    minLength: 1,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  justification: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 120000, minimum: 0 })
  @IsInt()
  @Min(0)
  unitAmountMinor: number;

  @ApiProperty({ example: 'sponsor-2026', minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  fundingSource: string;
}

export class CreateBudgetPlanDto {
  @ApiProperty({ example: 'plan-req-01J9Z8Q7' })
  @IsString()
  @Matches(ID_PATTERN)
  requestId: string;

  @ApiProperty({ example: 'tenant-alpha' })
  @IsString()
  @Matches(ID_PATTERN)
  tenantId: string;

  @ApiProperty({ example: 'project-1' })
  @IsString()
  @Matches(ID_PATTERN)
  projectId: string;

  @ApiProperty({ example: 'model-project-1' })
  @IsString()
  @Matches(ID_PATTERN)
  fundingModelId: string;

  @ApiProperty({ example: 'charter-project-1' })
  @IsString()
  @Matches(ID_PATTERN)
  charterId: string;

  @ApiProperty({ type: [BudgetLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  lines: BudgetLineDto[];

  @ApiProperty({ example: 500000, minimum: 0 })
  @IsInt()
  @Min(0)
  approvalThresholdMinor: number;

  @ApiProperty({ example: 0, minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @ApiPropertyOptional({ example: 'member-finance-1' })
  @IsOptional()
  @IsString()
  @Matches(ID_PATTERN)
  approverId?: string;

  @ApiPropertyOptional({
    enum: ProjectFundingRole,
    example: ProjectFundingRole.FINANCE,
  })
  @IsOptional()
  @IsEnum(ProjectFundingRole)
  approverRole?: ProjectFundingRole;
}
