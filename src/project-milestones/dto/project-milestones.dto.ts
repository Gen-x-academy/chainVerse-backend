import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  MilestoneProjectRole,
  MilestoneStatus,
} from '../project-milestones.types';

/** All mutation DTOs must carry an idempotency key. */
export class MutationDto {
  @ApiProperty({
    description:
      'Client-generated retry key, scoped to tenant, actor and action. ' +
      'Reusing the same key with an identical payload replays the original response; ' +
      'reusing it with a different payload returns 409.',
    pattern: '^[A-Za-z0-9._-]{8,128}$',
    example: 'mstone-create-abc123',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey!: string;
}

export class CreateMilestoneDto extends MutationDto {
  @ApiProperty({ minLength: 1, maxLength: 200, example: 'Design phase complete' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    description: 'Optional narrative description of what the milestone covers.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    description: 'ISO-8601 due date (date or datetime).',
    example: '2027-03-31',
  })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({
    description:
      'IDs of milestones that must be COMPLETED before this one can become ACTIVE.',
    type: [String],
    maxItems: 20,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  dependsOn?: string[];

  @ApiPropertyOptional({
    description: 'User ID of the designated reviewer.',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reviewerId?: string;

  @ApiPropertyOptional({
    description: 'List of expected deliverable descriptions (not logged).',
    type: [String],
    maxItems: 50,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  deliverables?: string[];

  @ApiPropertyOptional({
    description: 'Opaque funding reference linking to an external budget item.',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fundingReferenceId?: string;

  @ApiPropertyOptional({
    description: 'Completion criteria note authored by the planner (not logged).',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  completionCriteria?: string;
}

export class UpdateMilestoneDto extends MutationDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'ISO-8601 due date.',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    description: 'Replacement dependency list.',
    type: [String],
    maxItems: 20,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  dependsOn?: string[];

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reviewerId?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 50,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  deliverables?: string[];

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fundingReferenceId?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  completionCriteria?: string;
}

export class RegisterProjectDto {
  @ApiProperty({ example: 'project-uuid', minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  projectId!: string;

  @ApiProperty({
    description: 'Initial project membership map.',
    example: { 'user-1': 'owner' },
  })
  @IsOptional()
  @IsObject()
  members?: Record<string, MilestoneProjectRole>;
}

export class TransitionMilestoneDto extends MutationDto {
  @ApiProperty({
    enum: MilestoneStatus,
    description:
      'Target status. Allowed transitions: draft→active, draft→cancelled, active→completed, active→cancelled.',
  })
  @IsEnum(MilestoneStatus)
  status!: MilestoneStatus;

  @ApiPropertyOptional({
    description:
      'Required when transitioning to CANCELLED. Free-text reason (not logged).',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cancellationReason?: string;
}

export class AssignReviewerDto extends MutationDto {
  @ApiProperty({
    description: 'User ID of the new reviewer.',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  reviewerId!: string;
}
