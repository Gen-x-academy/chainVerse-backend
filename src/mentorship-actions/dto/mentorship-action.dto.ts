import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateActionItemDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  engagementId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  assigneeId!: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'urgent'] })
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  sourceSessionId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reminders?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completionEvidence?: string[];
}

export class UpdateActionItemDto {
  @ApiPropertyOptional({
    enum: [
      'open',
      'acknowledged',
      'in_progress',
      'completed',
      'blocked',
      'cancelled',
    ],
  })
  @IsOptional()
  @IsIn([
    'open',
    'acknowledged',
    'in_progress',
    'completed',
    'blocked',
    'cancelled',
  ])
  status?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completionEvidence?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reminders?: string[];
}

export class CreateMilestoneDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  engagementId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  goalId!: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty()
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  reviewerId?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  paymentLinkageId?: string;
}
