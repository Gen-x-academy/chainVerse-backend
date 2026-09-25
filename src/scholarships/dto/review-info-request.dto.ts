import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { InfoRequestStatus } from '../schemas/review-info-request.schema';

// ── Question DTO ──────────────────────────────────────────────────────────────

/**
 * A single question within a CreateInfoRequestDto.
 *
 * The service validates that `questionKey` values are unique within the
 * questions array after DTO validation passes.
 */
export class InfoRequestQuestionDto {
  @ApiProperty({
    description:
      'Stable slug for this question within the request ' +
      '(e.g. "proof_of_enrollment", "gpa_transcript"). ' +
      'Must be unique within the request.',
    example: 'proof_of_enrollment',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  questionKey: string;

  @ApiProperty({
    description: 'Human-readable question text shown to the applicant.',
    example: 'Please provide your most recent official transcript.',
    maxLength: 1000,
  })
  @IsString()
  @MaxLength(1000)
  text: string;

  @ApiPropertyOptional({
    description:
      'Whether this question must be answered. Defaults to true. ' +
      'Optional questions may be omitted from the response.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description: 'Per-question guidance shown to the applicant.',
    example: 'Attach a scan or paste a publicly accessible link.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  hint?: string;
}

// ── Create DTO ────────────────────────────────────────────────────────────────

/**
 * Body DTO for `POST …/applications/:applicationId/info-requests`.
 *
 * Authorization: OWNER, ADMIN, or INSTRUCTOR (reviewer creating the request).
 *
 * Business rules enforced by the service:
 *   - Application must exist and be scoped to the organization.
 *   - Application must be in UNDER_REVIEW status.
 *   - `questions` must contain at least one entry.
 *   - `questionKey` values must be unique within the array.
 *   - `deadline` must be a future UTC timestamp.
 */
export class CreateInfoRequestDto {
  @ApiProperty({
    description:
      'Bounded list of questions for the applicant. ' +
      'At least one question required. ' +
      'Each questionKey must be unique within the request.',
    type: [InfoRequestQuestionDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InfoRequestQuestionDto)
  questions: InfoRequestQuestionDto[];

  @ApiProperty({
    description:
      'Response deadline (ISO-8601 UTC). ' +
      'Must be in the future. ' +
      'Requests not responded to by this time are automatically expired.',
    example: '2026-10-15T23:59:59.000Z',
  })
  @IsDateString()
  deadline: string;

  @ApiPropertyOptional({
    description:
      'Optional context note from the reviewer visible to the applicant.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewerNote?: string;
}

// ── Answer entry DTO ──────────────────────────────────────────────────────────

/**
 * One answer within a SubmitInfoResponseDto.
 *
 * `questionId` must reference an `_id` from the parent request's
 * `questions` array.  The service validates this and rejects unknown ids.
 */
export class InfoResponseAnswerDto {
  @ApiProperty({
    description:
      'ObjectId of the question being answered ' +
      '(must match one of the _id values in the request\'s questions array).',
    example: '64f1a2b3c4d5e6f7a8b9c0d1',
  })
  @IsMongoId()
  questionId: string;

  @ApiProperty({
    description: 'The applicant\'s text answer for this question.',
    example: 'Please find my transcript at: https://example.edu/transcript/abc123',
    maxLength: 5000,
  })
  @IsString()
  @MaxLength(5000)
  value: string;
}

// ── Submit response DTO ───────────────────────────────────────────────────────

/**
 * Body DTO for `POST …/info-requests/:requestId/responses`.
 *
 * Authorization: the authenticated applicant who owns the application.
 *
 * Business rules enforced by the service:
 *   - Request must exist and be scoped to the organization.
 *   - Request status must be OPEN (CANCELLED / EXPIRED requests cannot
 *     accept new responses; RESPONDED requests accept a new version).
 *   - Deadline must not have passed.
 *   - All required questions must have a corresponding answer entry.
 *   - Every `questionId` in `answers` must reference a question on the request.
 *   - Duplicate `questionId` entries are not allowed in the same response.
 *
 * Versioning:
 *   Each successful submission appends a new `InfoRequestResponse` to the
 *   request's `responses` array with an auto-incremented `version` number.
 *   The first submission also transitions the request status to RESPONDED.
 *   Subsequent submissions increment the version but do not change the status.
 */
export class SubmitInfoResponseDto {
  @ApiProperty({
    description:
      'Answers for each question in the request. ' +
      'All required questions must be included. ' +
      'Duplicate questionId entries are not permitted.',
    type: [InfoResponseAnswerDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InfoResponseAnswerDto)
  answers: InfoResponseAnswerDto[];

  @ApiPropertyOptional({
    description: 'Optional covering note from the applicant.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

// ── Cancel DTO ────────────────────────────────────────────────────────────────

/**
 * Body DTO for `DELETE …/info-requests/:requestId`.
 *
 * Authorization: only the reviewer who created the request may cancel it.
 *
 * Business rules enforced by the service:
 *   - Request must be in OPEN or RESPONDED status to be cancellable.
 *   - Only the original `reviewerId` may cancel (BIZ_INFO_REQUEST_CANCEL_FORBIDDEN
 *     returned otherwise).
 */
export class CancelInfoRequestDto {
  @ApiPropertyOptional({
    description: 'Optional reason for cancellation (visible to the applicant).',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ── Query DTOs ────────────────────────────────────────────────────────────────

/**
 * Query parameters for listing info-requests on an application.
 */
export class ListInfoRequestsQueryDto {
  @ApiProperty({ description: 'Owning organization id (tenant scope).' })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({
    enum: InfoRequestStatus,
    description: 'Filter by info-request status.',
  })
  @IsOptional()
  @IsEnum(InfoRequestStatus)
  status?: InfoRequestStatus;
}

/**
 * Minimal query DTO when only the tenant scope is needed (e.g. single-resource
 * fetch and cancel endpoints).
 */
export class InfoRequestScopeQueryDto {
  @ApiProperty({ description: 'Owning organization id (tenant scope).' })
  @IsMongoId()
  organizationId: string;
}

// ── Response shapes ───────────────────────────────────────────────────────────

/**
 * Public shape of a single info-request returned by the API.
 *
 * Staff (OWNER / ADMIN / INSTRUCTOR) receive the full document including
 * `reviewerId` and all response versions.
 *
 * Applicants receive the same shape but `reviewerId` is omitted at the
 * serialization layer (use a response interceptor or a dedicated mapper if
 * role-based field masking is required).
 */
export interface InfoRequestResult {
  id: string;
  organizationId: string;
  applicationId: string;
  programId: string;
  reviewerId: string;
  applicantId: string;
  status: InfoRequestStatus;
  questions: Array<{
    id: string;
    questionKey: string;
    text: string;
    required: boolean;
    hint?: string;
  }>;
  deadline: string;
  reviewerNote?: string;
  responses: Array<{
    id: string;
    version: number;
    answers: Array<{ questionId: string; value: string }>;
    note?: string;
    submittedBy: string;
    submittedAt: string;
  }>;
  /** Latest response version number; 0 when no responses exist yet. */
  latestVersion: number;
  cancellationReason?: string;
  cancelledAt?: string;
  expiredAt?: string;
  createdAt: string;
  updatedAt: string;
}
