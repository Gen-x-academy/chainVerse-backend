import { PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Payload for creating a new course reserve.
 *
 * At least one of `copyId` (physical copy) or `editionId` (digital license)
 * must be provided. The service enforces this as a business rule.
 */
export class CreateCourseReserveDto {
  @ApiProperty({
    description: 'ID of the course this reserve serves.',
    example: 'COURSE-CS101-2026',
  })
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @ApiPropertyOptional({
    description: 'MongoDB ObjectId of the physical BookCopy to place on reserve.',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId()
  copyId?: string;

  @ApiPropertyOptional({
    description: 'Identifier of the digital edition/license to place on reserve.',
    example: 'EDITION-ISBN-9780451524935',
  })
  @IsOptional()
  @IsString()
  editionId?: string;

  @ApiProperty({
    description: 'ISO 8601 date string for when the reserve begins.',
    example: '2026-01-15',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'ISO 8601 date string for when the reserve ends (inclusive).',
    example: '2026-05-31',
  })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    description:
      'Shortened loan period in days that applies while the reserve is active. ' +
      'Must be between 1 and 90.',
    minimum: 1,
    maximum: 90,
    example: 3,
  })
  @IsInt()
  @Min(1)
  @Max(90)
  specialLoanPeriodDays: number;

  @ApiPropertyOptional({
    description: 'Optional librarian notes (rationale, instructor contact, etc.).',
    maxLength: 500,
    example: 'Required reading for CS101. Contact Prof. Smith for questions.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * All fields optional for partial updates (e.g., updating notes or dates
 * before the reserve begins).
 */
export class UpdateCourseReserveDto extends PartialType(CreateCourseReserveDto) {}
