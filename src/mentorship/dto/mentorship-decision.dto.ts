import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ApplicantReasonCode,
  CommunicationPolicy,
  DecisionType,
  InternalReasonCode,
} from '../enums/mentorship.enums';

export class RecordDecisionDto {
  @ApiProperty({ enum: DecisionType, example: DecisionType.ACCEPT })
  @IsEnum(DecisionType)
  type: DecisionType;

  @ApiProperty({
    enum: ApplicantReasonCode,
    example: ApplicantReasonCode.STRONG_FIT,
    description: 'Shown to the applicant',
  })
  @IsEnum(ApplicantReasonCode)
  applicantReasonCode: ApplicantReasonCode;

  @ApiPropertyOptional({
    example: 'Welcome aboard — your first session invite follows shortly.',
    description: 'Shown to the applicant',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  applicantMessage?: string;

  @ApiPropertyOptional({
    enum: InternalReasonCode,
    example: InternalReasonCode.SCORING_THRESHOLD,
    description: 'Reviewers and staff only; never returned to the applicant',
  })
  @IsOptional()
  @IsEnum(InternalReasonCode)
  internalReasonCode?: InternalReasonCode;

  @ApiPropertyOptional({
    example: 'Scored 8/10 on the take-home review.',
    description: 'Reviewers and staff only; never returned to the applicant',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNote?: string;

  @ApiPropertyOptional({
    example: '2026-10-20T09:00:00.000Z',
    description:
      'When the decision becomes visible to the applicant. Defaults to now; may not be in the past.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveAt?: Date;

  @ApiPropertyOptional({
    enum: CommunicationPolicy,
    default: CommunicationPolicy.NOTIFY_IMMEDIATELY,
  })
  @IsOptional()
  @IsEnum(CommunicationPolicy)
  communicationPolicy?: CommunicationPolicy;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Application version the reviewer was looking at. A mismatch returns 409 instead of overwriting a newer decision.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class WithdrawApplicationDto {
  @ApiProperty({
    example: true,
    description:
      'Must be true. Confirms the consequences returned by GET …/withdrawal-preview.',
  })
  @IsBoolean()
  @Equals(true, { message: 'acknowledgeConsequences must be true' })
  acknowledgeConsequences: boolean;

  @ApiProperty({
    example: 'b3f1c0…',
    description:
      'Token from GET …/withdrawal-preview. Rejected if the application changed since the preview.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  confirmationToken: string;

  @ApiPropertyOptional({
    example: 'My schedule changed and I cannot commit to weekly sessions.',
    description: 'Visible to the applicant and the reviewers',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
