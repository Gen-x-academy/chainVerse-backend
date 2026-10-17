import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsObject, IsOptional,
  IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class CreateCohortDto {
  @IsString() @MaxLength(160) name!: string;
  @IsInt() @Min(1) @Max(10000) capacity!: number;
  @IsDateString() enrollmentStartsAt!: string;
  @IsDateString() enrollmentEndsAt!: string;
  @IsArray() @IsString({ each: true }) coordinatorIds!: string[];
  @IsOptional() @IsObject() calendar?: Record<string, unknown>;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

export class EnrollInCohortDto {
  @IsString() participantId!: string;
}

export class TransferCoordinatorDto {
  @IsString() coordinatorId!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class EligibilityRuleDto {
  @IsString() @MaxLength(80) key!: string;
  @IsEnum(['equals', 'contains', 'gte', 'in']) operator!: 'equals' | 'contains' | 'gte' | 'in';
  value!: string | number | boolean | string[];
  @IsOptional() @IsBoolean() required?: boolean;
}

export class CreateEligibilityVersionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => EligibilityRuleDto)
  rules!: EligibilityRuleDto[];
}

export class EligibilityEvaluationDto {
  @IsObject() attributes!: Record<string, unknown>;
  @IsOptional() @IsBoolean() guardianConsent?: boolean;
  @IsOptional() @IsBoolean() geographyConsent?: boolean;
}
