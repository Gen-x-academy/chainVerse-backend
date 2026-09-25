import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrgScopedQueryDto } from './scholarship-program.dto';
import { ScholarshipApplicationStatus } from '../schemas/scholarship-application.schema';
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
