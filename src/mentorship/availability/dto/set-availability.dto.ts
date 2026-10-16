import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MentorAvailabilityStatus } from '../availability.machine';

export class SetAvailabilityDto {
  @ApiProperty({ enum: MentorAvailabilityStatus })
  @IsEnum(MentorAvailabilityStatus)
  status: MentorAvailabilityStatus;

  @ApiPropertyOptional({
    description: 'When the change takes effect. Defaults to now.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveFrom?: Date;

  @ApiPropertyOptional({
    description: 'Required for `limited`: the cap on concurrent mentees.',
    minimum: 1,
    maximum: 100,
  })
  @ValidateIf((o: SetAvailabilityDto) => o.maxActiveMentees !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  maxActiveMentees?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({
    description: 'Unique per change; resending the same key is a no-op.',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @Length(8, 64)
  idempotencyKey: string;
}
