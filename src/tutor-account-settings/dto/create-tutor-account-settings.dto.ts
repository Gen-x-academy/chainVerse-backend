import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTutorAccountSettingsDto {
  @ApiPropertyOptional({ example: 'Ada L.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ example: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  newCourseEnrollmentNotifications?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  studentMessageNotifications?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  reviewNotifications?: boolean;

  @ApiPropertyOptional({
    enum: ['available', 'busy', 'unavailable'],
    example: 'available',
  })
  @IsOptional()
  @IsEnum(['available', 'busy', 'unavailable'])
  availabilityStatus?: 'available' | 'busy' | 'unavailable';

  @ApiPropertyOptional({ enum: ['public', 'private'], example: 'private' })
  @IsOptional()
  @IsEnum(['public', 'private'])
  profileVisibility?: 'public' | 'private';
}
