import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReadingListReportQueryDto {
  @ApiPropertyOptional({ description: 'Course ID to filter by' })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({ description: 'Tutor ID to filter by' })
  @IsOptional()
  @IsString()
  tutorId?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Report type',
    enum: ['availability', 'borrowing', 'tutor_summary'],
    example: 'availability',
    default: 'availability',
  })
  @IsOptional()
  @IsString()
  reportType?: string;

  @ApiPropertyOptional({ description: 'Maximum items to return', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}
