import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class DuplicateDetectionQueryDto {
  @ApiPropertyOptional({
    description: 'Similarity threshold (0-1). Pairs scoring above this are flagged.',
    default: 0.8,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  @IsOptional()
  threshold?: number = 0.8;

  @ApiPropertyOptional({
    description: 'Maximum number of duplicate pairs to return.',
    default: 50,
  })
  @IsNumber()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 50;
}
