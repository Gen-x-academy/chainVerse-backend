import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum FeedbackRoleDto {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

export class SubmitFeedbackDto {
  @ApiProperty()
  @IsString()
  sessionId!: string;

  @ApiProperty({ enum: FeedbackRoleDto })
  @IsEnum(FeedbackRoleDto)
  role!: FeedbackRoleDto;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  strengths?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  protectedComment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  revealAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  consentToAggregate?: boolean;
}

export class UpdateFeedbackDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  strengths?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  protectedComment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  revealAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  consentToAggregate?: boolean;
}
