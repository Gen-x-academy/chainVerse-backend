import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRemovalRequestDto {
  @ApiProperty({ description: 'Id of the content to remove', maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  contentId!: string;

  @ApiProperty({
    description: 'Kind of content, e.g. "post" or "comment"',
    maxLength: 64,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  contentType!: string;

  @ApiProperty({
    description: 'Why the content should be removed',
    maxLength: 2000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({ description: 'Optional extra context' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
