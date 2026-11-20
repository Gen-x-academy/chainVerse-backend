import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CalibrationPolicy {
  NONE = 'none',
  TRIM_OUTLIERS = 'trim_outliers',
}

export enum MissingReviewPolicy {
  ABSTAIN = 'abstain',
  ZERO_FILL = 'zero_fill',
}

export enum DeliverableKind {
  FILE = 'file',
  LINK = 'link',
  DATASET = 'dataset',
  COMMIT = 'commit',
  DEMONSTRATION = 'demonstration',
  TEXT = 'text',
}

export enum DeliverableDecision {
  ACCEPT = 'accept',
  REQUEST_CHANGES = 'request_changes',
  REJECT = 'reject',
}

export class IdempotentRequestDto {
  @ApiProperty({ description: 'Client generated retry key for this mutation' })
  @IsString()
  @MaxLength(128)
  idempotencyKey: string;
}

export class CriterionScoreDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  criterion: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;
}

export class RegisterProposalDto extends IdempotentRequestDto {
  @ApiProperty({
    description: 'Private proposal content; never returned or audited',
  })
  @IsString()
  @MaxLength(4000)
  privatePayload: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  criteria: string[];
}

export class SubmitReviewDto extends IdempotentRequestDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  proposalVersion: number;

  @ApiProperty({ type: [CriterionScoreDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CriterionScoreDto)
  scores: CriterionScoreDto[];

  @ApiPropertyOptional({
    description: 'Private reviewer note; never returned or audited',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;
}

export class AggregateOutcomesDto extends IdempotentRequestDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quorum: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  acceptanceThreshold: number;

  @ApiProperty({ enum: CalibrationPolicy })
  @IsEnum(CalibrationPolicy)
  calibrationPolicy: CalibrationPolicy;

  @ApiProperty({ enum: MissingReviewPolicy })
  @IsEnum(MissingReviewPolicy)
  missingReviewPolicy: MissingReviewPolicy;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  strictQuorum?: boolean = false;
}

export class RequestRevisionDto extends IdempotentRequestDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  proposalVersion: number;

  @ApiProperty({ description: 'ISO-8601 response deadline' })
  @IsISO8601()
  deadline: string;

  @ApiProperty({
    description: 'Private revision instructions; never returned or audited',
  })
  @IsString()
  @MaxLength(4000)
  instructions: string;
}

export class RespondToRevisionDto extends IdempotentRequestDto {
  @ApiProperty({ minimum: 2 })
  @IsInt()
  @Min(2)
  newVersion: number;

  @ApiProperty({
    description: 'Private replacement content; never returned or audited',
  })
  @IsString()
  @MaxLength(4000)
  privatePayload: string;
}

export class SubmitDeliverableDto extends IdempotentRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  milestoneId: string;

  @ApiProperty({ enum: DeliverableKind })
  @IsEnum(DeliverableKind)
  kind: DeliverableKind;

  @ApiProperty({
    description: 'Private deliverable reference; never returned or audited',
  })
  @IsString()
  @MaxLength(4000)
  reference: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  checksum?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  reviewerIds: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  requirementIds: string[];

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  requiredApprovals: number;
}

export class ReviewDeliverableDto extends IdempotentRequestDto {
  @ApiProperty({ enum: DeliverableDecision })
  @IsEnum(DeliverableDecision)
  decision: DeliverableDecision;

  @ApiProperty({ type: [CriterionScoreDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CriterionScoreDto)
  rubricScores: CriterionScoreDto[];

  @ApiProperty({ description: 'Private rationale; never returned or audited' })
  @IsString()
  @MaxLength(4000)
  rationale: string;
}
