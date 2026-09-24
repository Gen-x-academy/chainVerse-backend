import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * The owning student is taken from the JWT, never from the payload — there is
 * deliberately no `studentId` field here.
 */
export class CreateStudentAccountSettingsDto {
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

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;

  @ApiPropertyOptional({ enum: ['public', 'private'], example: 'private' })
  @IsOptional()
  @IsEnum(['public', 'private'])
  profileVisibility?: 'public' | 'private';
}
