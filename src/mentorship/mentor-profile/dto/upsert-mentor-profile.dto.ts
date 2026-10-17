import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MentorProfileVisibility } from '../schemas/mentor-profile.schema';

export class MentorProfileLinkDto {
  @ApiProperty({ example: 'Portfolio', maxLength: 60 })
  @IsString()
  @MaxLength(60)
  label: string;

  @ApiProperty({ example: 'https://example.com/me', maxLength: 300 })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(300)
  url: string;
}

/**
 * Body for saving a draft. Every field is optional so a mentor can save partial
 * work; completeness is enforced when the profile is published. Lengths and shapes
 * are always enforced.
 */
export class UpsertMentorProfileDto {
  @ApiPropertyOptional({ maxLength: 120, example: 'Backend engineer teaching Rust' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 15 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  expertise?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 10, example: ['en', 'yo'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(35, { each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: 'Africa/Lagos', description: 'IANA time zone name' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 80 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  yearsOfExperience?: number;

  @ApiPropertyOptional({ maxLength: 40, example: 'online' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  deliveryMode?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({ maxLength: 1500 })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  teachingApproach?: string;

  @ApiPropertyOptional({ type: [MentorProfileLinkDto], maxItems: 8 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => MentorProfileLinkDto)
  links?: MentorProfileLinkDto[];

  @ApiPropertyOptional({ enum: MentorProfileVisibility, default: MentorProfileVisibility.PUBLIC })
  @IsOptional()
  @IsEnum(MentorProfileVisibility)
  visibility?: MentorProfileVisibility;
}
