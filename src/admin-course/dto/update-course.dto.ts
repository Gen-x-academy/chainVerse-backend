import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  Min,
  IsArray,
  IsOptional,
  IsUrl,
  IsEnum,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurriculumItemDto } from './create-course.dto';

export class UpdateCourseDto {
  @ApiProperty({ example: 'Blockchain Fundamentals Updated', required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ example: 'Updated description...', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'Technology', required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ example: ['blockchain', 'crypto'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({ example: 149.99, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiProperty({
    example: 'https://example.com/new-thumbnail.jpg',
    required: false,
  })
  @IsUrl()
  @IsOptional()
  thumbnailUrl?: string;

  @ApiProperty({ example: ['https://example.com/img1.jpg'], required: false })
  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  thumbnailImages?: string[];

  @ApiProperty({
    example: 'intermediate',
    enum: ['beginner', 'intermediate', 'advanced', 'all-levels'],
    required: false,
  })
  @IsEnum(['beginner', 'intermediate', 'advanced', 'all-levels'])
  @IsOptional()
  level?: 'beginner' | 'intermediate' | 'advanced' | 'all-levels';

  @ApiProperty({ example: '12 hours', required: false })
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiProperty({ example: 12, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  durationHours?: number;

  @ApiProperty({ example: 'English', required: false })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  hasCertificate?: boolean;

  @ApiProperty({ type: [CurriculumItemDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CurriculumItemDto)
  @IsOptional()
  curriculum?: CurriculumItemDto[];
}
