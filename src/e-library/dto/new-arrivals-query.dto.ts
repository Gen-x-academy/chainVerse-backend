import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BookFormat } from '../schemas/book.schema';

export class NewArrivalsQueryDto {
  @ApiPropertyOptional({ description: 'Look-back window in days', default: 30, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  @Type(() => Number)
  days?: number = 30;

  @ApiPropertyOptional({ description: 'Filter by format', enum: BookFormat })
  @IsOptional()
  @IsEnum(BookFormat)
  format?: BookFormat;

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
