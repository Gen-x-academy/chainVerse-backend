import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReviewMode, REVIEWER_ROLES } from '../proposal-review.types';

export class RubricCriterionDto {
  @ApiProperty({ example: 'impact' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  key: string;

  @ApiProperty({ example: 'Community impact' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @ApiProperty({
    example: 40,
    description: 'Percentage weight; all criterion weights must sum to 100.',
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  weight: number;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore: number;
}

export class ReviewScoreDto {
  @ApiProperty({ example: 'impact' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  criterionKey: string;

  @ApiProperty({ example: 4 })
  @IsNumber()
  @Min(0)
  @Max(1000)
  score: number;
}

export class CreateProposalDto {
  @ApiProperty({ example: 'Clean water for Kano' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    example: 'A short public abstract that may also contain applicant details.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  summary: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  applicantName: string;

  @ApiProperty({ example: 'ada@example.org' })
  @IsEmail()
  @MaxLength(320)
  applicantEmail: string;

  @ApiProperty({ example: 'ORG-12345' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organizationIdentifier: string;

  @ApiProperty({ example: 'proposal-key-01' })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey: string;
}

export class CreateQueueDto {
  @ApiProperty({ example: '2026 community grants' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: ReviewMode, example: ReviewMode.BLINDED })
  @IsEnum(ReviewMode)
  reviewMode: ReviewMode;

  @ApiProperty({ example: 'rubric-key-01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  rubricId: string;

  @ApiProperty({ example: [...REVIEWER_ROLES] })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn([...REVIEWER_ROLES], { each: true })
  allowedReviewerRoles: string[];

  @ApiProperty({ example: 'queue-key-01' })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey: string;
}

export class AssignReviewerDto {
  @ApiPropertyOptional({ description: 'Supplied by the queue path parameter.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  queueId?: string;

  @ApiProperty({ example: 'proposal-id' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  proposalId: string;

  @ApiProperty({ example: 'reviewer-7' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  reviewerId: string;

  @ApiProperty({ example: [...REVIEWER_ROLES] })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn([...REVIEWER_ROLES], { each: true })
  reviewerRoles: string[];

  @ApiProperty({ example: 'assignment-key-01' })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey: string;
}

export class CreateRubricDto {
  @ApiProperty({ example: 'Community impact rubric' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ type: [RubricCriterionDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionDto)
  criteria: RubricCriterionDto[];

  @ApiProperty({ example: 'rubric-key-01' })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey: string;
}

export class CreateRevisionCycleDto {
  @ApiProperty({ example: 'proposal-id' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  proposalId: string;

  @ApiProperty({ example: 'Revision requested by committee' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  cycleLabel: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(2)
  @Max(100)
  round: number;

  @ApiProperty({ example: 'cycle-key-01' })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey: string;
}

export class SubmitReviewDto {
  @ApiProperty({ example: 'proposal-id' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  proposalId: string;

  @ApiProperty({ example: 'queue-id' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  queueId: string;

  @ApiProperty({ type: [ReviewScoreDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReviewScoreDto)
  scores: ReviewScoreDto[];

  @ApiPropertyOptional({
    example: 'Private notes never exposed by any endpoint.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  privateNotes?: string;

  @ApiPropertyOptional({ example: 'cycle-id' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  revisionCycleId?: string;

  @ApiProperty({ example: 'review-key-01' })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey: string;
}

export class ProposalViewDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;
}

export class ReviewerProposalViewDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  summary: string;

  @ApiPropertyOptional({ description: 'Present only in open review mode.' })
  applicantName?: string;

  @ApiPropertyOptional({ description: 'Present only in open review mode.' })
  applicantEmail?: string;

  @ApiPropertyOptional({ description: 'Present only in open review mode.' })
  organizationIdentifier?: string;
}

export class QueueViewDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ReviewMode })
  reviewMode: ReviewMode;

  @ApiProperty()
  rubricId: string;

  @ApiProperty({ type: [String] })
  allowedReviewerRoles: string[];

  @ApiProperty({ type: [String] })
  assignedProposalIds: string[];
}

export class RubricViewDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [RubricCriterionDto] })
  criteria: RubricCriterionDto[];

  @ApiProperty()
  createdAt: string;
}

export class RevisionCycleViewDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  proposalId: string;

  @ApiProperty()
  cycleLabel: string;

  @ApiProperty()
  round: number;

  @ApiProperty()
  open: boolean;
}

export class ReviewViewDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  proposalId: string;

  @ApiProperty()
  reviewerId: string;

  @ApiProperty()
  queueId: string;

  @ApiProperty()
  rubricId: string;

  @ApiPropertyOptional()
  revisionCycleId?: string;

  @ApiProperty()
  weightedScore: number;

  @ApiProperty()
  submittedAt: string;
}

export class AuditViewDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  actorId: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  entityType: string;

  @ApiProperty()
  entityId: string;

  @ApiProperty()
  idempotencyKey: string;

  @ApiProperty()
  at: string;
}
