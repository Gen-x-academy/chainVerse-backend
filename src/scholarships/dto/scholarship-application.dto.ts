import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrgScopedQueryDto } from './scholarship-program.dto';
import { ScholarshipApplicationStatus } from '../schemas/scholarship-application.schema';
import { SortOrder } from '../../common/dto/pagination.dto';
import { AnswerDto } from './answer.dto';

export class CreateScholarshipApplicationDto {
  @ApiProperty({ description: 'Owning organization id (tenant scope)' })
  @IsMongoId()
  organizationId: string;

  @ApiProperty({ description: 'Scholarship program being applied to' })
  @IsMongoId()
  programId: string;

  @ApiProperty({
    description: 'The published terms version the applicant accepts',
  })
  @IsMongoId()
  acceptedTermsVersionId: string;

  @ApiPropertyOptional({
    description: 'Free-text personal statement (max 5 000 chars)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  statement?: string;

  /**
   * Answers to the program's application form fields.
   *
   * Each element must reference a valid `fieldId` from
   * `ScholarshipProgram.formFields`.  The service validates:
   *   1. No unknown field ids.
   *   2. No duplicate field ids.
   *   3. Required fields are answered.
   *   4. Answer word counts do not exceed the field's `wordLimit`.
   *
   * An empty array is valid for programs with no form fields.
   */
  @ApiPropertyOptional({
    type: [AnswerDto],
    description:
      'Answers to the program application form fields.  ' +
      'Validated server-side against the program form definition.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers?: AnswerDto[];
}

export enum ApplicationDecision {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class ReviewScholarshipApplicationDto {
  @ApiProperty({ enum: ApplicationDecision })
  @IsEnum(ApplicationDecision)
  decision: ApplicationDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ScholarshipApplicationQueryDto extends OrgScopedQueryDto {
  @ApiPropertyOptional({ enum: ScholarshipApplicationStatus })
  @IsOptional()
  @IsEnum(ScholarshipApplicationStatus)
  status?: ScholarshipApplicationStatus;
}

/**
 * Sort fields allowed on `GET scholarships/applications/me` (#1249).
 *
 * Whitelisted so a caller cannot sort by an arbitrary document field, and so
 * the service can always append its own `_id` tie-breaker.
 */
export enum ApplicationHistorySortField {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  STATUS = 'status',
}

/** Hard ceiling on `limit`; a student's history can span thousands of rows. */
export const APPLICATION_HISTORY_MAX_LIMIT = 100;

/**
 * Query for the applicant's own application history (#1249).
 *
 * Ownership:
 *   - The applicant is taken from the JWT (`@CurrentUser('sub')`), never from
 *     the query string, so one student can never page another student's data.
 *
 * Operational impact:
 *   - Responses are now paged.  Callers that read `length` of the body (it was
 *     an array) must read `body.data.length` and `body.total` instead.
 *   - `limit` is capped at 100; `page` and `limit` are both optional and
 *     default to `page=1, limit=20`.
 */
export class ScholarshipApplicationHistoryQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: '1-based page number.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: APPLICATION_HISTORY_MAX_LIMIT,
    description: `Items per page. Hard maximum ${APPLICATION_HISTORY_MAX_LIMIT}.`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(APPLICATION_HISTORY_MAX_LIMIT)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: ApplicationHistorySortField,
    default: ApplicationHistorySortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(ApplicationHistorySortField)
  sortBy?: ApplicationHistorySortField = ApplicationHistorySortField.CREATED_AT;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.DESC,
    description:
      'Direction of `sortBy`. `_id` always breaks ties in the same direction.',
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}
