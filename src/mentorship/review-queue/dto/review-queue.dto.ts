import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import {
  DECISION_OUTCOMES,
  DecisionOutcome,
  Priority,
  PRIORITIES,
} from '../../applications/schemas/mentorship-application.schema';
import { objectId } from '../../shared/joi-validation.pipe';
import { QUEUE_SORTS, QueueSort } from '../domain/queue-cursor';

export const QUEUE_STATUSES = ['open', 'submitted', 'in_review', 'decided'] as const;
export const COI_FILTERS = ['cleared', 'conflicted', 'undeclared'] as const;

export class QueueQueryDto {
  @ApiPropertyOptional({ description: 'Restrict to one program (must be in your scope)' })
  programId?: string;

  @ApiPropertyOptional({ enum: QUEUE_STATUSES, default: 'open', description: 'open = submitted + in_review' })
  status?: (typeof QUEUE_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Comma-separated priorities', example: 'high,urgent' })
  priority?: Priority[];

  @ApiPropertyOptional({
    description: "'me', 'unassigned', 'any', or a reviewer id (leads/owners/admins only)",
    default: 'any',
  })
  assignee?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  dueBefore?: Date;

  @ApiPropertyOptional({ description: 'Only items past their due date' })
  overdue?: boolean;

  @ApiPropertyOptional({ enum: COI_FILTERS, description: 'Your own conflict-of-interest status' })
  coi?: (typeof COI_FILTERS)[number];

  @ApiPropertyOptional({ enum: QUEUE_SORTS, default: 'priority' })
  sort?: QueueSort;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page' })
  cursor?: string;
}

export class AssignDto {
  @ApiPropertyOptional({ description: 'Reviewer to assign; omit to claim for yourself' })
  assigneeId?: string;

  @ApiProperty({ description: 'Application version you are acting on (optimistic concurrency)' })
  expectedVersion: number;
}

export class UnassignDto {
  @ApiProperty() expectedVersion: number;
}

export class TriageDto {
  @ApiPropertyOptional({ enum: PRIORITIES }) priority?: Priority;
  @ApiPropertyOptional({ format: 'date-time' }) dueAt?: Date;
  @ApiProperty() expectedVersion: number;
}

export class ConflictDeclarationDto {
  @ApiProperty({ description: 'true if you have a conflict of interest with this applicant' })
  hasConflict: boolean;

  @ApiPropertyOptional({ maxLength: 500, description: 'Required when hasConflict is true. Private to you, the owner and admins.' })
  reason?: string;
}

export class DecisionDto {
  @ApiProperty({ enum: DECISION_OUTCOMES }) outcome: DecisionOutcome;
  @ApiPropertyOptional({ maxLength: 2000, description: 'Internal note; never shown to the applicant' }) note?: string;
  @ApiProperty() expectedVersion: number;
}

export const queueQuerySchema = Joi.object<QueueQueryDto>({
  programId: objectId(),
  status: Joi.string().valid(...QUEUE_STATUSES).default('open'),
  priority: Joi.string()
    .pattern(new RegExp(`^(${PRIORITIES.join('|')})(,(${PRIORITIES.join('|')}))*$`))
    .custom((v: string) => [...new Set(v.split(','))].sort())
    .messages({ 'string.pattern.base': `priority must be a comma-separated list of ${PRIORITIES.join(', ')}` }),
  assignee: Joi.string().max(128).default('any'),
  dueBefore: Joi.date().iso(),
  overdue: Joi.boolean(),
  coi: Joi.string().valid(...COI_FILTERS),
  sort: Joi.string().valid(...QUEUE_SORTS).default('priority'),
  limit: Joi.number().integer().min(1).max(100).default(25),
  cursor: Joi.string().max(1024),
});

export const workloadQuerySchema = Joi.object({ programId: objectId().required() });

const expectedVersion = Joi.number().integer().min(0).required();

export const assignSchema = Joi.object<AssignDto>({ assigneeId: Joi.string().max(128), expectedVersion });
export const unassignSchema = Joi.object<UnassignDto>({ expectedVersion });
export const triageSchema = Joi.object<TriageDto>({
  priority: Joi.string().valid(...PRIORITIES),
  dueAt: Joi.date().iso(),
  expectedVersion,
}).or('priority', 'dueAt');
export const conflictDeclarationSchema = Joi.object<ConflictDeclarationDto>({
  hasConflict: Joi.boolean().required(),
  reason: Joi.when('hasConflict', {
    is: true,
    then: Joi.string().trim().min(3).max(500).required(),
    otherwise: Joi.string().trim().max(500).allow(''),
  }),
});
export const decisionSchema = Joi.object<DecisionDto>({
  outcome: Joi.string().valid(...DECISION_OUTCOMES).required(),
  note: Joi.string().trim().max(2000).allow(''),
  expectedVersion,
});
