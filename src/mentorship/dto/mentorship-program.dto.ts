import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReapplicationMode } from '../enums/mentorship.enums';

export class ReapplicationPolicyDto {
  @ApiProperty({
    enum: ReapplicationMode,
    example: ReapplicationMode.AFTER_WITHDRAWAL,
  })
  @IsEnum(ReapplicationMode)
  mode: ReapplicationMode;

  @ApiPropertyOptional({
    example: 72,
    description: 'Hours that must pass after the previous application closed',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 365)
  cooldownHours?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Maximum applications per applicant, the first one included',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;
}

export class CreateMentorshipProgramDto {
  @ApiProperty({ example: 'Soroban smart-contract security mentorship' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    example: 'Six weekly 1-on-1 sessions reviewing your own contracts.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({
    example: 5,
    description: 'Seats available to accepted applicants',
  })
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity: number;

  @ApiPropertyOptional({ example: '2026-11-30T23:59:59.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  applicationsCloseAt?: Date;

  @ApiPropertyOptional({
    example: '2026-12-07T23:59:59.000Z',
    description: 'Applicants cannot withdraw after this instant',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  withdrawalCutoffAt?: Date;

  @ApiProperty({
    example: '2026-10-v1',
    description: 'Version of the consent text applicants must accept',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  consentVersion: string;

  @ApiPropertyOptional({ type: ReapplicationPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReapplicationPolicyDto)
  reapplication?: ReapplicationPolicyDto;

  @ApiPropertyOptional({
    example: '665f1c2e8b3a4d0012345678',
    description:
      'Mentor who owns the program. Admins only; tutors always own the programs they create.',
  })
  @IsOptional()
  @IsMongoId()
  mentorId?: string;
}
