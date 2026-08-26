import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpsertBorrowerPreferenceDto {
  @ApiPropertyOptional({ description: 'Enable email reminders', default: true })
  @IsOptional()
  @IsBoolean()
  emailReminders?: boolean;

  @ApiPropertyOptional({ description: 'Enable in-app reminders', default: true })
  @IsOptional()
  @IsBoolean()
  inAppReminders?: boolean;

  @ApiPropertyOptional({
    description: 'Quiet hours start (HH:mm format)',
    example: '22:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-2]\d:[0-5]\d$/)
  quietHoursStart?: string;

  @ApiPropertyOptional({
    description: 'Quiet hours end (HH:mm format)',
    example: '07:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-2]\d:[0-5]\d$/)
  quietHoursEnd?: string;

  @ApiPropertyOptional({ description: 'Preferred locale', example: 'en-US' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ description: 'IANA timezone', example: 'America/New_York' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Opt out of mandatory transactional notices',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  optOutMandatoryNotices?: boolean;
}
