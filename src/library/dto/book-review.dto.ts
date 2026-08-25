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
import { ReportReason, ReportStatus } from '../schemas/book-review.schema';

export class CreateBookReviewDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  bookId: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Excellent introduction to the topic.' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  body?: string;
}

export class CreateContentReportDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiProperty({ example: 'book' })
  @IsString()
  @IsNotEmpty()
  targetType: string;

  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({ example: 'The ISBN listed is incorrect.' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  detail?: string;
}

export class ResolveContentReportDto {
  @ApiProperty({ enum: ReportStatus, example: ReportStatus.RESOLVED })
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @ApiPropertyOptional({ example: 'Metadata corrected and re-indexed.' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  resolution?: string;
}
