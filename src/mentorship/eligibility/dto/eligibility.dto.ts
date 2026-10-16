import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { RULE_TYPES, EligibilityRule } from '../domain/eligibility-rule.types';
import { rulesSchema } from '../domain/eligibility.evaluator';

export class EligibilityRuleDto {
  @ApiProperty({ pattern: '^[a-z0-9][a-z0-9_-]{0,63}$', description: 'Opaque id shown to applicants' })
  id: string;

  @ApiProperty({ enum: RULE_TYPES })
  type: string;

  @ApiProperty({
    description:
      'min_completed_courses {count} | completed_course {courseIds, match} | max_active_applications {max} | ' +
      'answer_in {questionKey, values} | answer_number_range {questionKey, min?, max?}',
  })
  params: Record<string, unknown>;

  @ApiProperty({ maxLength: 500, description: 'Plain-text explanation shown on fail / needs_information' })
  publicMessage: string;

  @ApiPropertyOptional({ description: 'https URL or same-origin path for remediation' })
  remediationUrl?: string;

  @ApiPropertyOptional({ default: false, description: 'Hide type/message/remediation from applicants' })
  sensitive?: boolean;
}

export class PublishRulesDto {
  @ApiProperty({ type: [EligibilityRuleDto] })
  rules: EligibilityRule[];

  @ApiProperty({ description: 'Rule-set version the edit is based on (0 when none exists yet)' })
  expectedCurrentVersion: number;
}

export class PreflightDto {
  @ApiProperty({ description: 'Answers keyed by question key (partial answers allowed)', example: { years_experience: 2 } })
  answers: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Form version the client rendered; reported back in staleInputs if outdated' })
  formVersion?: number;

  @ApiPropertyOptional({ description: 'Rule-set version from a previous preflight; reported back in staleInputs if outdated' })
  ruleSetVersion?: number;
}

export class PreflightCheckDto {
  @ApiProperty() ruleId: string;
  @ApiProperty({ enum: ['pass', 'fail', 'needs_information'] }) outcome: string;
  @ApiPropertyOptional({ description: 'Omitted for sensitive rules' }) type?: string;
  @ApiPropertyOptional() message?: string;
  @ApiPropertyOptional() remediationUrl?: string;
  @ApiPropertyOptional({ description: 'Question to answer for needs_information' }) questionKey?: string;
}

export class PreflightResultDto {
  @ApiProperty({ enum: ['pass', 'fail', 'needs_information'] }) outcome: string;
  @ApiProperty({ type: [PreflightCheckDto] }) checks: PreflightCheckDto[];
  @ApiProperty({ description: 'Rule-set version evaluated (also recorded server-side)' }) evaluatedRuleSetVersion: number;
  @ApiProperty() formVersion: number;
  @ApiProperty({ format: 'date-time' }) evaluatedAt: string;
  @ApiProperty({ type: [String], description: "Any of 'formVersion', 'ruleSetVersion', 'answers'" }) staleInputs: string[];
  @ApiProperty({ type: [String] }) ignoredAnswerKeys: string[];
  @ApiProperty({ type: [String] }) missingRequiredQuestions: string[];
}

export const publishRulesSchema = Joi.object<PublishRulesDto>({
  rules: rulesSchema.required(),
  expectedCurrentVersion: Joi.number().integer().min(0).required(),
});

export const preflightSchema = Joi.object<PreflightDto>({
  answers: Joi.object().pattern(Joi.string().max(64), Joi.any()).max(200).required(),
  formVersion: Joi.number().integer().min(1),
  ruleSetVersion: Joi.number().integer().min(0),
});
