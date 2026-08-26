import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReminderChannel } from '../schemas/reminder-preference.schema';

class QuietHoursDto {
  @ApiProperty({ description: 'Start of quiet hours (0-23 hour)', example: 22 })
  @IsInt()
  @Min(0)
  @Max(23)
  startHour: number;

  @ApiProperty({ description: 'End of quiet hours (0-23 hour)', example: 7 })
  @IsInt()
  @Min(0)
  @Max(23)
  endHour: number;

  @ApiPropertyOptional({ description: 'IANA timezone', example: 'UTC' })
  @IsOptional()
  timezone?: string;
}

export class UpdateReminderPreferenceDto {
  @ApiProperty({
    enum: ReminderChannel,
    isArray: true,
    example: [ReminderChannel.IN_APP, ReminderChannel.EMAIL],
  })
  @IsArray()
  @ArrayUnique()
  @IsEnum(ReminderChannel, { each: true })
  channels: ReminderChannel[];

  @ApiPropertyOptional({ type: QuietHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto | null;

  @ApiPropertyOptional({ description: 'Enable or disable all reminders' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
