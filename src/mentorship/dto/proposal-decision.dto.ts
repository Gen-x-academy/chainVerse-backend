import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class ApproveProposalDto {
  @ApiProperty({
    description: 'termsVersion the participant reviewed; a mismatch returns BIZ_MENTORSHIP_TERMS_STALE',
    example: 1,
  })
  @IsInt()
  @Min(1)
  termsVersion!: number;

  @ApiPropertyOptional({ description: 'termsHash the participant reviewed (recommended)' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  termsHash?: string;

  @ApiProperty({ description: 'Must be true: explicit acceptance of the terms', example: true })
  @IsBoolean()
  @Equals(true, { message: 'acceptTerms must be true to approve' })
  acceptTerms!: boolean;
}

export class RejectProposalDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
