import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
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

export class CurriculumItemDto {
  @ApiProperty({ example: 'Introduction to Blockchain' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'Learn the basics of blockchain technology',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '2 hours', required: false })
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0)
  order: number;

  @ApiProperty({
    example: [{ title: 'Video 1', type: 'video', url: 'https://...' }],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceDto)
  @IsOptional()
  resources?: ResourceDto[];
}

export class ResourceDto {
  @ApiProperty({ example: 'Introduction Video' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'video',
    enum: ['video', 'pdf', 'quiz', 'assignment', 'link'],
  })
  @IsEnum(['video', 'pdf', 'quiz', 'assignment', 'link'])
  type: string;

  @ApiProperty({ example: 'https://...' })
  @IsUrl()
  url: string;
}

export class CreateCourseDto {
  @ApiProperty({ example: 'Blockchain Fundamentals' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'Learn the fundamentals of blockchain technology...',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'Technology' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: ['blockchain', 'crypto', 'web3'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({ example: 99.99 })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  price: number;

  @ApiProperty({
    example: 'https://example.com/thumbnail.jpg',
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
    example: 'beginner',
    enum: ['beginner', 'intermediate', 'advanced', 'all-levels'],
    required: false,
  })
  @IsEnum(['beginner', 'intermediate', 'advanced', 'all-levels'])
  @IsOptional()
  level?: 'beginner' | 'intermediate' | 'advanced' | 'all-levels';

  @ApiProperty({ example: '10 hours', required: false })
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiProperty({ example: 10, required: false })
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
