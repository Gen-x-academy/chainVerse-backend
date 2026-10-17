import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MentorshipMode } from '../mentorship-applications.constants';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AvailabilitySlotDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '18:00' })
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @ApiProperty({ example: '20:00' })
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm' })
  endTime!: string;
}

export class ScheduleDto {
  @ApiProperty({ example: 'Africa/Lagos' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone!: string;

  @ApiProperty({ type: [AvailabilitySlotDto] })
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  @ArrayMaxSize(21)
  availability!: AvailabilitySlotDto[];

  @ApiPropertyOptional({ minimum: 1, maximum: 40 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40)
  hoursPerWeek?: number;
}

export class ConsentDto {
  @ApiProperty()
  @IsBoolean()
  termsAccepted!: boolean;

  @ApiProperty()
  @IsBoolean()
  dataProcessingAccepted!: boolean;

  @ApiProperty({ description: 'Consent version shown to the mentee' })
  @IsString()
  @MaxLength(32)
  consentVersion!: string;
}

/**
 * Editable application fields shared by create and autosave. Every field is
 * optional: drafts may be partial; completeness is enforced on submit.
 */
export class ApplicationFieldsDto {
  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  goals?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  expectations?: string;

  @ApiPropertyOptional({ type: ScheduleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleDto)
  schedule?: ScheduleDto;

  @ApiPropertyOptional({ enum: MentorshipMode })
  @IsOptional()
  @IsEnum(MentorshipMode)
  preferredMode?: MentorshipMode;

  @ApiPropertyOptional({ type: ConsentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConsentDto)
  consent?: ConsentDto;

  @ApiPropertyOptional({
    description:
      'Program answers keyed by form question key. A null value clears the answer. ' +
      'Keys and lengths are validated against the draft\'s form version.',
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    example: { experience: 'Two years of Solidity' },
  })
  @IsOptional()
  @IsObject()
  answers?: Record<string, string | null>;
}
