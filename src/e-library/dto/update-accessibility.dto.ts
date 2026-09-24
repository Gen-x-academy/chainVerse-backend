import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Update accessibility metadata for an edition's alternate formats
 * (Issue #999). All fields are optional booleans describing the *publication*,
 * never a borrower's disability or accommodation status.
 */
export class UpdateAccessibilityDto {
  @ApiPropertyOptional({ description: 'Available as large-print edition' })
  @IsOptional()
  @IsBoolean()
  largePrint?: boolean;

  @ApiPropertyOptional({ description: 'Dyslexia-friendly typography/layout' })
  @IsOptional()
  @IsBoolean()
  dyslexiaFriendly?: boolean;

  @ApiPropertyOptional({ description: 'Compatible with screen readers' })
  @IsOptional()
  @IsBoolean()
  screenReaderReady?: boolean;

  @ApiPropertyOptional({ description: 'Includes captions (/video)' })
  @IsOptional()
  @IsBoolean()
  captioned?: boolean;

  @ApiPropertyOptional({ description: 'Includes a full transcript' })
  @IsOptional()
  @IsBoolean()
  transcript?: boolean;

  @ApiPropertyOptional({ description: 'Available as an audiobook' })
  @IsOptional()
  @IsBoolean()
  audiobook?: boolean;

  @ApiPropertyOptional({ description: 'ISO 639-1 language code of the format' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  language?: string;
}

/**
 * Search filter for alternate-format accessibility attributes
 * (Issue #999). Used by the public catalog browse endpoint to filter
 * published editions by accessibility feature without exposing patron data.
 */
export class AccessibilityFilterDto {
  @ApiPropertyOptional({ description: 'Only editions available as large-print' })
  @IsOptional()
  @IsBoolean()
  largePrint?: boolean;

  @ApiPropertyOptional({ description: 'Only dyslexia-friendly editions' })
  @IsOptional()
  @IsBoolean()
  dyslexiaFriendly?: boolean;

  @ApiPropertyOptional({ description: 'Only screen-reader-ready editions' })
  @IsOptional()
  @IsBoolean()
  screenReaderReady?: boolean;

  @ApiPropertyOptional({ description: 'Only captioned editions' })
  @IsOptional()
  @IsBoolean()
  captioned?: boolean;

  @ApiPropertyOptional({ description: 'Only editions with a transcript' })
  @IsOptional()
  @IsBoolean()
  transcript?: boolean;

  @ApiPropertyOptional({ description: 'Only audiobook editions' })
  @IsOptional()
  @IsBoolean()
  audiobook?: boolean;
}
