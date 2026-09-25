import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  BODY_BACKED_CONTENT_TYPES,
  CONTENT_UNIT_TYPES,
  ContentUnitType,
  URL_BACKED_CONTENT_TYPES,
} from '../enums/content-type.enum';

/**
 * Rejects content units whose payload does not match their declared type —
 * a video without a URL, or an article without a body, never reaches Mongo.
 */
@ValidatorConstraint({ name: 'contentUnitPayload', async: false })
export class ContentUnitPayloadConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const unit = args.object as ContentUnitDto;
    if (URL_BACKED_CONTENT_TYPES.has(unit.type)) {
      return typeof unit.url === 'string' && unit.url.trim().length > 0;
    }
    if (BODY_BACKED_CONTENT_TYPES.has(unit.type)) {
      return typeof unit.body === 'string' && unit.body.trim().length > 0;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const unit = args.object as ContentUnitDto;
    const required = URL_BACKED_CONTENT_TYPES.has(unit.type) ? 'url' : 'body';
    return `content unit of type "${unit.type}" requires a non-empty ${required}`;
  }
}

export class ContentUnitDto {
  @ApiProperty({ enum: CONTENT_UNIT_TYPES, example: ContentUnitType.VIDEO })
  @IsEnum(ContentUnitType)
  @Validate(ContentUnitPayloadConstraint)
  type: ContentUnitType;

  @ApiProperty({ example: 'What is a smart contract?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 0, description: 'Zero-based position in the lesson' })
  @IsInt()
  @Min(0)
  order: number;

  @ApiPropertyOptional({ example: 'https://cdn.chainverse.io/lesson-1.mp4' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @ApiPropertyOptional({ example: 'A smart contract is …' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  durationMinutes?: number;
}
