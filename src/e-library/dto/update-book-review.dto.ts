import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReviewStatus } from '../schemas/book-review.schema';

export class UpdateBookReviewDto {
  @ApiPropertyOptional({ description: 'Updated rating (1-5)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Updated review title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Updated review body' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  content?: string;

  @ApiPropertyOptional({ enum: ReviewStatus, description: 'Moderator status update' })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}
