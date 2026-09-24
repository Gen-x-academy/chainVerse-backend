import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecommendationsQueryDto {
  @ApiPropertyOptional({
    default: 10,
    maximum: 30,
    description: 'Maximum number of recommendations to return',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number = 10;

  @ApiPropertyOptional({
    default: true,
    description: 'Exclude items with no available copies',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  excludeUnavailable?: boolean = true;
}
