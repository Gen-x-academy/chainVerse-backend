import { ApiPropertyOptional } from '@nestjs/swagger';

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
  query?: string;

  /**
   * Filter by category stored in metadata.category.
   * Comparison is case-insensitive.
   */
  @ApiPropertyOptional({
    description: 'Filter by course category (metadata.category)',
    example: 'web3',
  })
  category?: string;

  /**
   * Filter by difficulty level stored in metadata.level.
   * Comparison is case-insensitive.
   */
  @ApiPropertyOptional({
    description: 'Filter by difficulty level (metadata.level)',
    example: 'beginner',
  })
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
  tags?: string[];
}
