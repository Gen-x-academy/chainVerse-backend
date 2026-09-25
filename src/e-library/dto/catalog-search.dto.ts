import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BookFormat } from '../schemas/book.schema';

export class CatalogSearchDto {
  @ApiProperty({ description: 'Full-text search query', example: 'machine learning', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  q: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Results per page', default: 20, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by format', enum: BookFormat })
  @IsOptional()
  @IsEnum(BookFormat)
  format?: BookFormat;
}
