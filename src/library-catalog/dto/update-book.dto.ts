import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, IsArray, IsNumber } from 'class-validator';

export class UpdateBookDto {
  @ApiPropertyOptional({ description: 'Book title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'List of authors' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authors?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publisher?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  publishedYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Current revision of the record; used for optimistic concurrency', minimum: 0 })
  @IsInt()
  @Min(0)
  revision: number;
}