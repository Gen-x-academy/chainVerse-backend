import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FieldType } from '../schemas/application-form.schema';

// ── ConditionalRuleDto ────────────────────────────────────────────────────────

export class ConditionalRuleDto {
  @ApiProperty({ description: 'fieldId of the controlling field' })
  @IsString()
  fieldId: string;

  @ApiProperty({ description: 'Value that must be set on the controlling field' })
  @IsString()
  value: string;
}

// ── FormFieldDto ──────────────────────────────────────────────────────────────

export class FormFieldDto {
  @ApiProperty({ description: 'Unique identifier for this field (UUID)' })
  @IsString()
  fieldId: string;

  @ApiProperty({ description: 'Human-readable label shown to the applicant', maxLength: 300 })
  @IsString()
  @MaxLength(300)
  label: string;

  @ApiProperty({ enum: FieldType, description: 'Input type of this field' })
  @IsEnum(FieldType)
  type: FieldType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Allowed choices for SELECT / MULTISELECT fields',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ description: 'Max character length for TEXT / TEXTAREA fields' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxLength?: number;

  @ApiPropertyOptional({
    type: ConditionalRuleDto,
    description: 'Display this field only when the referenced field has the given value',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ConditionalRuleDto)
  conditionalOn?: ConditionalRuleDto;
}

// ── FormSectionDto ────────────────────────────────────────────────────────────

export class FormSectionDto {
  @ApiProperty({ description: 'Unique identifier for this section (UUID)' })
  @IsString()
  sectionId: string;

  @ApiProperty({ description: 'Section heading', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Zero-based display order', minimum: 0 })
  @IsNumber()
  @Min(0)
  order: number;

  @ApiProperty({ type: [FormFieldDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields: FormFieldDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

// ── CreateApplicationFormDto ──────────────────────────────────────────────────

export class CreateApplicationFormDto {
  @ApiProperty({ description: 'ID of the scholarship programme this form belongs to' })
  @IsString()
  programId: string;

  @ApiProperty({ description: 'Tenant (organisation) that owns this form' })
  @IsString()
  tenantId: string;

  @ApiProperty({ description: 'Descriptive title of the application form', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ type: [FormSectionDto], description: 'Ordered list of form sections' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormSectionDto)
  sections: FormSectionDto[];
}

// ── UpdateApplicationFormDto ──────────────────────────────────────────────────

/**
 * All fields are optional.  Updates are only accepted while the form is in
 * DRAFT status; attempting to update a PUBLISHED form raises a
 * BusinessRuleException (BIZ_FORM_NOT_DRAFT).
 */
export class UpdateApplicationFormDto extends PartialType(CreateApplicationFormDto) {}

// ── PublishApplicationFormDto ─────────────────────────────────────────────────

/**
 * No body is required to publish a form.  This DTO is a placeholder that
 * allows future metadata (e.g. an effective-date) to be added without a
 * breaking API change.
 */
export class PublishApplicationFormDto {}

// ── FormAnswerDto ─────────────────────────────────────────────────────────────

export class FormAnswerDto {
  @ApiProperty({ description: 'fieldId this answer corresponds to' })
  @IsString()
  fieldId: string;

  @ApiProperty({
    description: 'Applicant answer — single string or array for MULTISELECT',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  value: string | string[];
}

// ── SubmitFormAnswersDto ──────────────────────────────────────────────────────

export class SubmitFormAnswersDto {
  @ApiProperty({ description: 'MongoDB ObjectId of the application form' })
  @IsString()
  formId: string;

  @ApiProperty({ description: 'Form version the applicant filled in' })
  @IsNumber()
  @Min(1)
  version: number;

  @ApiProperty({ type: [FormAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormAnswerDto)
  answers: FormAnswerDto[];
}
