import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ContentUnitDto } from './content-unit.dto';

export class CreateLessonDto {
  @ApiProperty({ example: 'Deploying your first contract' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Compile, deploy and verify on testnet' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [ContentUnitDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ContentUnitDto)
  contentUnits?: ContentUnitDto[];

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;

  @ApiPropertyOptional({ enum: ['draft', 'published'], example: 'draft' })
  @IsOptional()
  @IsEnum(['draft', 'published'])
  status?: 'draft' | 'published';
}
