import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CollectionReportQueryDto {
  @ApiPropertyOptional({
    description: 'Start date for the report window (ISO 8601)',
    example: '2026-06-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End date for the report window (ISO 8601)',
    example: '2026-08-25T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Filter by branch name',
  })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({
    description: 'Report type',
    enum: ['demand', 'low_availability', 'unused', 'aging', 'lost_damaged'],
    example: 'demand',
    default: 'demand',
  })
  @IsOptional()
  @IsString()
  reportType?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of items to return',
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}
