import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { PROGRAM_STATUSES, ProgramStatus } from '../schemas/mentorship-program.schema';
import { REVIEWER_ROLES, ReviewerRole } from '../schemas/program-reviewer.schema';

export class CreateProgramDto {
  @ApiProperty({ maxLength: 200, example: 'Soroban smart-contract mentorship' })
  title: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  description?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  applicationOpensAt?: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  applicationClosesAt?: Date | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 90, default: 7 })
  reviewSlaDays?: number;
}

export class UpdateProgramDto {
  @ApiPropertyOptional({ maxLength: 200 })
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  description?: string;

  @ApiPropertyOptional({ enum: PROGRAM_STATUSES })
  status?: ProgramStatus;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  applicationOpensAt?: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  applicationClosesAt?: Date | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 90 })
  reviewSlaDays?: number;
}

export class UpsertReviewerDto {
  @ApiPropertyOptional({ enum: REVIEWER_ROLES, default: 'reviewer' })
  role?: ReviewerRole;

  @ApiPropertyOptional({ minimum: 0, maximum: 500, default: 10, description: 'Max concurrent open assignments' })
  capacity?: number;

  @ApiPropertyOptional({ default: true, description: 'Set false to remove the reviewer from the queue scope' })
  active?: boolean;
}

const windowRule = (schema: Joi.ObjectSchema) =>
  schema.custom((value, helpers) => {
    if (value.applicationOpensAt && value.applicationClosesAt && value.applicationOpensAt >= value.applicationClosesAt) {
      return helpers.message({ custom: 'applicationClosesAt must be after applicationOpensAt' });
    }
    return value;
  });

export const createProgramSchema = windowRule(
  Joi.object<CreateProgramDto>({
    title: Joi.string().trim().min(3).max(200).required(),
    description: Joi.string().trim().max(5000).allow('').default(''),
    applicationOpensAt: Joi.date().iso().allow(null).default(null),
    applicationClosesAt: Joi.date().iso().allow(null).default(null),
    reviewSlaDays: Joi.number().integer().min(1).max(90),
  }),
);

export const updateProgramSchema = windowRule(
  Joi.object<UpdateProgramDto>({
    title: Joi.string().trim().min(3).max(200),
    description: Joi.string().trim().max(5000).allow(''),
    status: Joi.string().valid(...PROGRAM_STATUSES),
    applicationOpensAt: Joi.date().iso().allow(null),
    applicationClosesAt: Joi.date().iso().allow(null),
    reviewSlaDays: Joi.number().integer().min(1).max(90),
  }).min(1),
);

export const upsertReviewerSchema = Joi.object<UpsertReviewerDto>({
  role: Joi.string().valid(...REVIEWER_ROLES).default('reviewer'),
  capacity: Joi.number().integer().min(0).max(500).default(10),
  active: Joi.boolean().default(true),
});
