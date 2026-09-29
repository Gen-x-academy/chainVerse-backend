import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MatchDismissalReason } from '../schemas/matching.schema';
import { RankableSignalKind } from '../matching-fairness';

/** Maximum number of stated interests a student may hold. */
export const MAX_INTERESTS = 25;

/** Upper bound on a single interest tag, in characters. */
export const MAX_INTEREST_LENGTH = 64;

/**
 * Replaces a student's stated interests (#1176).
 *
 * Validation:
 *   - 1 … {@link MAX_INTERESTS} tags, each 2 … {@link MAX_INTEREST_LENGTH}
 *     characters.  Two characters is the floor so that a one-letter tag cannot
 *     match everything.
 *   - Protected characteristics are refused by the service and reported back in
 *     `rejectedInterests`; the request itself still succeeds with whatever tags
 *     were acceptable, because silently dropping a tag is worse UX than
 *     telling the student which one was refused.
 */
export class SetInterestsDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MAX_INTERESTS,
    example: ['distributed systems', 'stellar', 'smart contracts'],
    description:
      'Subjects the student wants to be matched on. Must be subject areas, ' +
      'skills or goals — not personal characteristics.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_INTERESTS)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(MAX_INTEREST_LENGTH, { each: true })
  interests: string[];
}

/**
 * Partial update of the personalization switches (#1176).
 *
 * `matchingOptedOut` is honoured immediately: when true the ranker stops reading
 * `interests` altogether and returns cold-start ordering, which is the
 * "support dismissal and opt-out" requirement rather than a cosmetic flag.
 */
export class UpdateMatchingPreferencesDto {
  @ApiPropertyOptional({
    description:
      'Opt out of personalized ranking. Interests are kept but not used; ' +
      'recommendations fall back to cold-start ordering.',
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  matchingOptedOut?: boolean;
}

export enum MatchSort {
  /** Highest score first. The default. */
  RELEVANCE = 'relevance',
  /** Largest award first; a deterministic cold-start tie-break. */
  AWARD = 'award',
  /** Closest deadline first. */
  DEADLINE = 'deadline',
}

/** Query for `GET scholarships/matching/recommendations` (#1176). */
export class ScholarshipMatchQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({ enum: MatchSort, default: MatchSort.RELEVANCE })
  @IsOptional()
  @IsEnum(MatchSort)
  sort?: MatchSort = MatchSort.RELEVANCE;

  @ApiPropertyOptional({
    description:
      'Set false to include programs the student has already applied to. ' +
      'They are excluded by default so the list stays actionable.',
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeApplied?: boolean = false;
}

/** Body for `POST scholarships/matching/dismissals`. */
export class DismissMatchDto {
  @ApiProperty({ description: 'Program the student does not want to see again' })
  @IsString()
  @MinLength(24)
  @MaxLength(24)
  programId: string;

  @ApiProperty({ enum: MatchDismissalReason })
  @IsEnum(MatchDismissalReason)
  reason: MatchDismissalReason;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    enum: RankableSignalKind,
    isArray: true,
    description:
      'Optional: which recommendation reasons the student objected to. Used ' +
      'to tune future ranking, never shared with the sponsor.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(RankableSignalKind, { each: true })
  flaggedSignals?: RankableSignalKind[];
}
