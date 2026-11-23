import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsTrue,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApprovalRole } from '../schemas/agreement.schema';

const ROLES = Object.values(ApprovalRole);

export class AgreementTermsDto {
  @ApiProperty({ type: [String], maxLength: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  goals!: string[];

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  scope!: string;

  @ApiProperty({ minimum: 1, maximum: 520 })
  @IsInt()
  @Min(1)
  @Max(520)
  durationWeeks!: number;

  @ApiProperty({ example: 'weekly', maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  cadence!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sessionsPerMonth!: number;

  @ApiProperty({ minimum: 15 })
  @IsInt()
  @Min(15)
  sessionLengthMinutes!: number;

  @ApiProperty({ example: '120.00' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'pricePerSession must be a decimal string with at most 2 decimals',
  })
  pricePerSession!: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  cancellationPolicy!: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  conductPolicy!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  evidenceRefs?: string[];
}

export class CreateAgreementDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  programId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  mentorId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  menteeId!: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  proposalId?: string;

  @ApiProperty({ type: AgreementTermsDto })
  @ValidateNested()
  @Type(() => AgreementTermsDto)
  terms!: AgreementTermsDto;

  @ApiPropertyOptional({ enum: ApprovalRole, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ROLES, { each: true })
  requiredApprovals?: ApprovalRole[];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNote?: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey!: string;
}

export class AddApprovalDto {
  @ApiProperty({ enum: ApprovalRole })
  @IsIn(ROLES)
  role!: ApprovalRole;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  termsVersion!: number;

  @ApiProperty()
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  termsHash!: string;

  @ApiProperty({ description: 'Must be true to record an approval.' })
  @IsBoolean()
  @IsTrue()
  acceptTerms!: boolean;
}

export class EndAgreementDto {
  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey?: string;
}
