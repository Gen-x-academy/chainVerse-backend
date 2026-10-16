import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BASIS_POINTS_TOTAL,
  MILESTONE_KEY_PATTERN,
  MilestoneType,
} from '../scholarship.constants';

export class MilestoneDefinitionDto {
  @ApiProperty({
    example: 'enrollment',
    description:
      'Stable key (lower-case, digits, `-`, `_`). Keep it unchanged across amendments.',
  })
  @Matches(MILESTONE_KEY_PATTERN, {
    message: 'key must match ^[a-z0-9][a-z0-9_-]{0,63}$',
  })
  key!: string;

  @ApiProperty({ enum: MilestoneType })
  @IsEnum(MilestoneType)
  type!: MilestoneType;

  @ApiProperty({ example: 'Confirmed enrollment' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Required for `custom` milestones' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    example: 2500,
    description: 'Share of the award in basis points (10000 = 100%)',
  })
  @IsInt()
  @Min(1)
  @Max(BASIS_POINTS_TOTAL)
  percentageBps!: number;

  @ApiPropertyOptional({
    description:
      'Optional cross-check. When supplied it must equal the server-derived amount.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountMinor?: number;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dueDate!: Date;
}

export class MilestoneScheduleDto {
  @ApiProperty({
    type: [MilestoneDefinitionDto],
    description: 'Milestones in payout order; due dates must strictly increase',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => MilestoneDefinitionDto)
  milestones!: MilestoneDefinitionDto[];
}

export class ProposeScheduleAmendmentDto extends MilestoneScheduleDto {
  @ApiProperty({ description: 'Why the binding schedule must change' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class DecideScheduleAmendmentDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
