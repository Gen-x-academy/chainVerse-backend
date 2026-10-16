import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BookFormat } from '../schemas/book.schema';

export enum PopularityWindow {
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

export class PopularBooksQueryDto {
  @ApiPropertyOptional({
    enum: PopularityWindow,
    default: PopularityWindow.MONTH,
    description: 'Aggregation window for the ranking',
  })
  @IsOptional()
  @IsEnum(PopularityWindow)
  window?: PopularityWindow = PopularityWindow.MONTH;

  @ApiPropertyOptional({
    default: 20,
    maximum: 50,
    description: 'Maximum number of books to return',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: BookFormat,
    description: 'Restrict results to a single format',
  })
  @IsOptional()
  @IsEnum(BookFormat)
  format?: BookFormat;
}
