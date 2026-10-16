import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BookFormat } from '../schemas/book.schema';

export enum AvailabilityFilter {
  AVAILABLE = 'available',
  ALL = 'all',
}

export class FacetedSearchDto {
  @ApiPropertyOptional({ description: 'Free-text search query', example: 'history' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Comma-separated format values', example: 'physical,ebook' })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({ description: 'Comma-separated topic values', example: 'science,technology' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({ description: 'Comma-separated language values', example: 'en,es' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Availability filter', enum: AvailabilityFilter, default: AvailabilityFilter.AVAILABLE })
  @IsOptional()
  @IsEnum(AvailabilityFilter)
  availability?: AvailabilityFilter = AvailabilityFilter.AVAILABLE;

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
}
