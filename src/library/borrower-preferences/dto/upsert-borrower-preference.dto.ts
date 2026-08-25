import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpsertBorrowerPreferenceDto {
  @ApiPropertyOptional({ description: 'Enable email reminders' })
  @IsOptional()
  @IsBoolean()
  emailRemindersEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable in-app reminders' })
  @IsOptional()
  @IsBoolean()
  inAppRemindersEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Quiet hours start, 24-h format HH:mm', example: '22:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'quietHoursStart must be HH:mm' })
  quietHoursStart?: string;

  @ApiPropertyOptional({ description: 'Quiet hours end, 24-h format HH:mm', example: '08:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'quietHoursEnd must be HH:mm' })
  quietHoursEnd?: string;

  @ApiPropertyOptional({ description: 'IANA timezone, e.g. Africa/Lagos' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: 'BCP-47 locale, e.g. en-NG' })
  @IsOptional()
  @IsString()
  locale?: string;
}