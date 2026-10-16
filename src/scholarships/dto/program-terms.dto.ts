import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTermsVersionDto {
  @ApiProperty({
    description: 'Eligibility rules for this revision (opaque, versioned snapshot)',
    type: Object,
  })
  @IsObject()
  eligibility: Record<string, unknown>;

  @ApiProperty({
    description: 'Deadlines for this revision (opaque, versioned snapshot)',
    type: Object,
  })
  @IsObject()
  deadlines: Record<string, unknown>;

  @ApiProperty({ description: 'Award value for this revision' })
  @IsNumber()
  @Min(0)
  awardValue: number;

  @ApiPropertyOptional({ description: 'ISO currency code', example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  awardCurrency?: string;

  @ApiPropertyOptional({
    description: 'Obligations the award carries',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  obligations?: string[];
}