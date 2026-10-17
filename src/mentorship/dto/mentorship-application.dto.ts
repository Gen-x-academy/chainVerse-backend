import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ApplicationConsentDto {
  @ApiProperty({
    example: true,
    description: 'Must be true; consent is never inferred or copied',
  })
  @IsBoolean()
  @Equals(true, { message: 'consent.accepted must be true' })
  accepted: boolean;

  @ApiProperty({
    example: '2026-10-v1',
    description: "Must equal the program's current consentVersion",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  version: string;
}

export class SubmitMentorshipApplicationDto {
  @ApiProperty({
    example:
      'I have shipped two Soroban contracts and want a security review mindset.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  motivation: string;

  @ApiPropertyOptional({
    example: ['Learn fuzzing', 'Prepare for an audit'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  goals?: string[];

  @ApiProperty({ type: ApplicationConsentDto })
  @ValidateNested()
  @Type(() => ApplicationConsentDto)
  consent: ApplicationConsentDto;
}

/**
 * Body for a reapplication. Motivation and goals default to the previous
 * application's answers; consent is always required again.
 */
export class ReapplyMentorshipApplicationDto {
  @ApiPropertyOptional({
    example: 'Since withdrawing I completed the Rust track and have more time.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  motivation?: string;

  @ApiPropertyOptional({ example: ['Learn fuzzing'], type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  goals?: string[];

  @ApiProperty({ type: ApplicationConsentDto })
  @ValidateNested()
  @Type(() => ApplicationConsentDto)
  consent: ApplicationConsentDto;
}

export class InformationResponseDto {
  @ApiProperty({
    example: 'My GitHub is github.com/jane-doe; the audit repo is public.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}
