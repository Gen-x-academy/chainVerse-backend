import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';

export class SubmitApplicationDto {
  @ApiProperty({ description: 'Form version the applicant filled in; must equal the current published version' })
  formVersion: number;

  @ApiPropertyOptional({
    description: 'Rule-set version shown by the last preflight; if supplied and outdated the submission is rejected as stale',
  })
  ruleSetVersion?: number;

  @ApiProperty({ description: 'Answers keyed by question key', example: { years_experience: 3, track: 'soroban' } })
  answers: Record<string, unknown>;
}

export const submitApplicationSchema = Joi.object<SubmitApplicationDto>({
  formVersion: Joi.number().integer().min(1).required(),
  ruleSetVersion: Joi.number().integer().min(0),
  answers: Joi.object().pattern(Joi.string().max(64), Joi.any()).max(200).required(),
});
