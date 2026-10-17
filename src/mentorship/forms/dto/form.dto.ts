import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import {
  CONDITION_OPERATORS,
  QUESTION_TYPES,
  QuestionDefinition,
} from '../domain/question.types';
import { questionsSchema } from '../domain/form-definition.validator';

class QuestionOptionDto {
  @ApiProperty({ pattern: '^[A-Za-z0-9_.-]{1,64}$' })
  value: string;

  @ApiProperty({ maxLength: 300 })
  label: string;
}

class VisibilityConditionDto {
  @ApiProperty({ description: 'Key of an *earlier* question' })
  questionKey: string;

  @ApiProperty({ enum: CONDITION_OPERATORS })
  operator: string;

  @ApiPropertyOptional({ description: 'Scalar for equals/not_equals, array for in, omitted for answered/not_answered' })
  value?: unknown;
}

export class QuestionDto {
  @ApiProperty({ pattern: '^[a-z][a-z0-9_]{0,63}$', example: 'years_experience' })
  key: string;

  @ApiProperty({ enum: QUESTION_TYPES })
  type: string;

  @ApiProperty({ maxLength: 300, description: 'Plain text only – markup is rejected' })
  label: string;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Plain text only – markup is rejected' })
  helpText?: string;

  @ApiProperty({ default: false })
  required: boolean;

  @ApiProperty({ minimum: 0, description: 'Display/evaluation order; must be unique' })
  order: number;

  @ApiPropertyOptional({
    description: 'minLength/maxLength (text), min/max/integer (number), minSelections/maxSelections (multi_choice)',
  })
  validation?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [QuestionOptionDto] })
  options?: QuestionOptionDto[];

  @ApiPropertyOptional({ type: VisibilityConditionDto })
  visibleWhen?: VisibilityConditionDto;
}

export class UpdateFormDraftDto {
  @ApiProperty({ type: [QuestionDto] })
  questions: QuestionDefinition[];

  @ApiProperty({ description: 'Draft revision the edit is based on (optimistic concurrency)' })
  expectedRevision: number;
}

export class PublishFormDto {
  @ApiProperty({ description: 'Draft revision being published; rejects if the draft changed meanwhile' })
  expectedRevision: number;
}

export const updateFormDraftSchema = Joi.object<UpdateFormDraftDto>({
  questions: questionsSchema.required(),
  expectedRevision: Joi.number().integer().min(0).required(),
});

export const publishFormSchema = Joi.object<PublishFormDto>({
  expectedRevision: Joi.number().integer().min(0).required(),
});
