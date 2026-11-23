import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WeeklyWindowDto {
  @ApiProperty({
    minimum: 0,
    maximum: 6,
    description: '0=Sunday ... 6=Saturday',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ minimum: 0, maximum: 1439 })
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @ApiProperty({ minimum: 1, maximum: 1440 })
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class AvailabilityExceptionDto {
  @ApiProperty({ example: '2026-12-25' })
  @IsDateString()
  date!: string;

  @ApiProperty({
    description: 'false blocks the date/window; true adds availability',
  })
  @IsBoolean()
  available!: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 1439 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute?: number;
}

export class SetAvailabilityScheduleDto {
  @ApiProperty({ example: 'Africa/Lagos' })
  @IsString()
  @Matches(/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/, {
    message: 'timeZone must be a valid IANA time zone name',
  })
  timeZone!: string;

  @ApiProperty({ minimum: 0, maximum: 10080 })
  @IsInt()
  @Min(0)
  @Max(10080)
  leadTimeMinutes!: number;

  @ApiProperty({ minimum: 0, maximum: 240 })
  @IsInt()
  @Min(0)
  @Max(240)
  bufferMinutes!: number;

  @ApiProperty({ minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  bookingHorizonDays!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiProperty({ type: [WeeklyWindowDto] })
  @IsArray()
  @ArrayMaxSize(56)
  @ValidateNested({ each: true })
  @Type(() => WeeklyWindowDto)
  weeklyWindows!: WeeklyWindowDto[];

  @ApiPropertyOptional({ type: [AvailabilityExceptionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(366)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityExceptionDto)
  exceptions?: AvailabilityExceptionDto[];
}
