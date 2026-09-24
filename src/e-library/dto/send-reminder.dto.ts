import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { ReminderType } from '../schemas/reminder-log.schema';

export class SendReminderDto {
  @ApiProperty({ description: 'Loan ID to send reminder for' })
  @IsMongoId()
  loanId: string;

  @ApiProperty({ enum: ReminderType, example: ReminderType.DUE_SOON })
  @IsEnum(ReminderType)
  reminderType: ReminderType;

  @ApiPropertyOptional({ description: 'Override channel (default: in_app)' })
  @IsOptional()
  @IsString()
  channel?: string;
}

export class ReminderLogQueryDto {
  @ApiPropertyOptional({ description: 'Filter by patron ID' })
  @IsOptional()
  @IsString()
  patronId?: string;

  @ApiPropertyOptional({ description: 'Filter by loan ID' })
  @IsOptional()
  @IsMongoId()
  loanId?: string;

  @ApiPropertyOptional({ description: 'Filter by reminder type' })
  @IsOptional()
  @IsEnum(ReminderType)
  reminderType?: ReminderType;

  @ApiPropertyOptional({ description: 'Filter from date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter to date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Limit results', default: 50 })
  @IsOptional()
  limit?: number;
}
