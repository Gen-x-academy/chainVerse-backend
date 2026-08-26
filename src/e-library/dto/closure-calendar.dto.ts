import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClosureCalendarDto {
  @ApiProperty({ description: 'Start date of closure (ISO string)' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ description: 'End date of closure (ISO string)' })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({ description: 'Reason for closure' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Whether this extends pickup windows' })
  @IsString()
  @IsOptional()
  extendsPickupWindows?: string;

  @ApiPropertyOptional({ description: 'Whether this blocks due dates' })
  @IsString()
  @IsOptional()
  blocksDueDates?: string;
}
