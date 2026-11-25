import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { ProfileVisibility, SafetyCaseStatus } from '../schemas/safety.schema';

export class TrustedContactDto {
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) relationship?: string;
}

export class UpdateSafetySettingsDto {
  @ApiPropertyOptional({ enum: ProfileVisibility }) @IsOptional() @IsEnum(ProfileVisibility)
  profileVisibility?: ProfileVisibility;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowSessionRecordingRequests?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() shareSessionScheduleWithTrustedContacts?: boolean;
  @ApiPropertyOptional({ type: [TrustedContactDto], description: 'Replaces the list; max 5.' })
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => TrustedContactDto)
  trustedContacts?: TrustedContactDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 32) acceptedConductVersion?: string;
}

export const REPORT_CATEGORIES = ['harassment', 'unsafe_behavior', 'scam', 'privacy', 'other'] as const;

export class CreateSafetyReportDto {
  @ApiProperty() @IsString() @Length(1, 64) subjectId!: string;
  @ApiProperty({ enum: REPORT_CATEGORIES }) @IsIn(REPORT_CATEGORIES) category!: (typeof REPORT_CATEGORIES)[number];
  @ApiProperty() @IsString() @Length(10, 4000) description!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 64) sessionId?: string;
  @ApiProperty() @IsString() @Length(8, 128) idempotencyKey!: string;
}

export class UpdateSafetyCaseDto {
  @ApiProperty({ enum: SafetyCaseStatus }) @IsEnum(SafetyCaseStatus) status!: SafetyCaseStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 2000) resolutionSummary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 2000) internalNote?: string;
}
