import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DeliverableKind } from '../schemas/mentorship-deliverable.schema';

const KINDS = Object.values(DeliverableKind);

export class SubmitDeliverableDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  engagementId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  milestoneId!: string;

  @ApiProperty({ enum: DeliverableKind })
  @IsIn(KINDS)
  kind!: DeliverableKind;

  @ApiProperty({
    description: 'Reference only — URL, commit sha or storage key',
    maxLength: 2048,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  reference!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  declaration?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  integrityHash?: string;

  @ApiPropertyOptional({
    description: 'Users allowed to review this deliverable (deny-by-default)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reviewerIds?: string[];

  @ApiPropertyOptional({ description: 'Hours until private access expires' })
  @IsOptional()
  @IsInt()
  @Min(1)
  accessTtlHours?: number;

  @ApiPropertyOptional({
    description: 'Milestone due date used for the late-submission policy',
  })
  @IsOptional()
  milestoneDueAt?: Date;
}

export class ReviewDeliverableDto {
  @ApiProperty({ enum: ['accept', 'request_changes', 'reject'] })
  @IsIn(['accept', 'request_changes', 'reject'])
  decision!: 'accept' | 'request_changes' | 'reject';

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Rubric entries as "criterion:score"',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  rubricScores?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  comments?: string[];
}
