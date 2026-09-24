import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBookReviewDto {
  @ApiProperty({ description: 'ID of the book being reviewed' })
  @IsString()
  @IsNotEmpty()
  bookId: string;

  @ApiProperty({ description: 'Rating from 1 to 5', example: 4 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ description: 'Review title', example: 'Great read' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    description: 'Review body text',
    example: 'Thoroughly enjoyed this book.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  content?: string;
}
