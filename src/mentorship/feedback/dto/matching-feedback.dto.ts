import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsTrue,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  FeedbackKind,
  FeedbackRetentionPolicy,
  FeedbackSubjectType,
} from '../schemas/matching-feedback.schema';

const KINDS = Object.values(FeedbackKind);
const SUBJECTS = Object.values(FeedbackSubjectType);
const POLICIES = Object.values(FeedbackRetentionPolicy);

export class SubmitFeedbackDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  subjectId!: string;

  @ApiProperty({ enum: FeedbackSubjectType })
  @IsIn(SUBJECTS)
  subjectType!: FeedbackSubjectType;

  @ApiProperty({ enum: FeedbackKind })
  @IsIn(KINDS)
  kind!: FeedbackKind;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  freeText?: string;

  @ApiProperty({
    description: 'Must be true. No feedback is stored without explicit consent.',
  })
  @IsTrue()
  consentGiven!: boolean;

  @ApiProperty({ enum: FeedbackRetentionPolicy })
  @IsIn(POLICIES)
  retentionPolicy!: FeedbackRetentionPolicy;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey!: string;
}

export class FeedbackAggregateQueryDto {
  @ApiPropertyOptional({ enum: FeedbackKind })
  @IsOptional()
  @IsIn(KINDS)
  kind?: FeedbackKind;

  @ApiPropertyOptional({ description: 'ISO-8601 inclusive lower bound.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 inclusive upper bound.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
