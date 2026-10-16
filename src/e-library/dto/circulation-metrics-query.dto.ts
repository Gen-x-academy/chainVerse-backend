import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CirculationMetricsQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)', example: '2026-07-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)', example: '2026-08-25T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filter by branch name' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ description: 'Filter by book format (physical, ebook, audiobook)' })
  @IsOptional()
  @IsString()
  format?: string;
}
