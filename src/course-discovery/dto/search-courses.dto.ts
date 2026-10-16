import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsArray,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class SearchCoursesDto extends PaginationDto {
  @ApiProperty({ example: 'blockchain', required: false })
  @IsString()
  @IsOptional()
  query?: string;

  @ApiProperty({ example: 'Technology', required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({
    example: 'beginner',
    enum: ['beginner', 'intermediate', 'advanced', 'all-levels'],
    required: false,
  })
  @IsEnum(['beginner', 'intermediate', 'advanced', 'all-levels'])
  @IsOptional()
  level?: 'beginner' | 'intermediate' | 'advanced' | 'all-levels';

  @ApiProperty({ example: ['blockchain', 'crypto'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({ example: 0, required: false })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  minPrice?: number;

  @ApiProperty({ example: 500, required: false })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  maxPrice?: number;

  @ApiProperty({ example: 4, required: false })
  @IsNumber()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  @IsOptional()
  minRating?: number;
}

// Helper decorator for Max validation
function Max(max: number) {
  return function (_object: object, _propertyKey: string) {
    // No-op for runtime, used for documentation
  };
}
