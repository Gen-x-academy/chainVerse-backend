import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Query parameters for the full-text course search endpoint.
 *
 * All fields are optional.  When multiple fields are supplied they are
 * combined with AND logic: a course must satisfy every constraint.
 */
export class SearchCourseDto {
  /** Free-text keyword(s) matched against title, description and metadata. */
  @ApiPropertyOptional({
    description:
      'Free-text keyword search across title, description and metadata',
    example: 'blockchain',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  /**
   * Filter by category stored in metadata.category.
   * Comparison is case-insensitive.
   */
  @ApiPropertyOptional({
    description: 'Filter by course category (metadata.category)',
    example: 'web3',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  /**
   * Filter by difficulty level stored in metadata.level.
   * Comparison is case-insensitive.
   */
  @ApiPropertyOptional({
    description: 'Filter by difficulty level (metadata.level)',
    example: 'beginner',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  level?: string;

  /**
   * Filter by one or more tags stored in metadata.tags (array).
   * A course must include ALL supplied tags (AND semantics).
   * Accepts a comma-separated string or a repeated query parameter.
   */
  @ApiPropertyOptional({
    description: 'Filter by tags (metadata.tags); all supplied tags must match',
    type: [String],
    example: ['defi', 'nft'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  tags?: string[];
}
