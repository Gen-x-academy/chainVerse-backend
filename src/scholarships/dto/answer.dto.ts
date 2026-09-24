import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Default maximum word count enforced at the DTO layer when the program form
 * does not specify a field-level limit.  This acts as a hard ceiling so that
 * oversized payloads are rejected before they reach the service.
 *
 * Field-specific limits (defined in the program's `formFields` array) are
 * validated a second time in `ScholarshipApplicationsService.apply()`.
 */
export const DEFAULT_ANSWER_WORD_LIMIT = 500;

/**
 * Maximum character length for a single answer value.  Kept deliberately
 * generous because average English word length is ~5 chars + space.
 * 500 words × 6 chars = 3 000, padded to 5 000 for safety.
 */
export const MAX_ANSWER_CHARACTER_LENGTH = 5000;

/**
 * A single answer supplied by an applicant for one form field.
 *
 * Field path: `answers[].fieldId` / `answers[].value`
 *
 * Ownership / Privacy notes:
 *   - Answers are scoped to a specific `ScholarshipApplication` which is
 *     tenant-scoped via `organizationId`.  Only the applicant and authorized
 *     organization staff (OWNER, ADMIN, INSTRUCTOR) may read them.
 *   - Answers may contain PII entered by the applicant (e.g. personal
 *     statements).  Treat them as PII at rest and in transit.
 */
export class AnswerDto {
  /**
   * The MongoDB ObjectId of the form field this answer belongs to.
   * Must match an entry in `ScholarshipProgram.formFields[].fieldId`.
   */
  @ApiProperty({
    description: 'The ObjectId of the form field being answered.',
    example: '507f1f77bcf86cd799439031',
  })
  @IsMongoId()
  fieldId: string;

  /**
   * The applicant's text response.  May be omitted for optional fields but
   * must be present (and non-empty) for required fields — that invariant is
   * enforced at service level after the form definition is fetched.
   */
  @ApiPropertyOptional({
    description:
      'Applicant answer text.  Required for mandatory form fields.',
    maxLength: MAX_ANSWER_CHARACTER_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ANSWER_CHARACTER_LENGTH)
  value?: string;

  /**
   * Client-computed word count for the answer value.  The server recomputes
   * this independently; the field is accepted as a hint and rejected when it
   * disagrees with the server count by more than 1 (rounding tolerance) or
   * when the server-computed count exceeds the field's word limit.
   *
   * Keeping the client value in the DTO ensures client and server rules agree
   * and gives the validation pipeline a place to attach a field-level error
   * message that identifies the offending `fieldId`.
   */
  @ApiPropertyOptional({
    description:
      'Client-computed word count.  Must not exceed the field word limit.  ' +
      `Defaults to ${DEFAULT_ANSWER_WORD_LIMIT} when the program form does not specify one.`,
    minimum: 0,
    maximum: DEFAULT_ANSWER_WORD_LIMIT,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(DEFAULT_ANSWER_WORD_LIMIT)
  @ValidateIf((o: AnswerDto) => o.wordCount !== undefined)
  wordCount?: number;
}
