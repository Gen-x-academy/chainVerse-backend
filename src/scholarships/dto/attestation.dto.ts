import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinDate,
} from 'class-validator';
import { AttestationScope } from '../schemas/eligibility-attestation.schema';

export class IssueAttestationDto {
  @ApiProperty()
  @IsMongoId()
  organizationId: string;

  @ApiProperty()
  @IsMongoId()
  programId: string;

  @ApiProperty({ description: 'Applicant user ID' })
  @IsString()
  applicantId: string;

  @ApiProperty({ description: 'Identity of the issuing service', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  issuer: string;

  @ApiProperty({ enum: AttestationScope })
  @IsEnum(AttestationScope)
  scope: AttestationScope;

  @ApiProperty({
    description: 'Claim schema version, e.g. "1.0"',
    maxLength: 20,
  })
  @IsString()
  @MaxLength(20)
  version: string;

  @ApiProperty({
    type: Object,
    description: 'Privacy-minimized claim payload — no raw PII',
  })
  @IsObject()
  payload: Record<string, unknown>;

  @ApiProperty({
    description: 'UTC expiry datetime — must be in the future',
    type: String,
    format: 'date-time',
  })
  @Type(() => Date)
  @IsDate()
  @MinDate(new Date(), {
    message: 'expiresAt must be a future date',
  })
  expiresAt: Date;
}

export class RevokeAttestationDto {
  @ApiPropertyOptional({ description: 'Reason for revocation', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
