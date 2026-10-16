import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'ChainVerse Academy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false, example: 'https://example.com' })
  @IsUrl()
  @IsOptional()
  website?: string;

  @ApiProperty({ required: false, example: 'https://example.com/logo.png' })
  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @ApiProperty({ required: false, type: Object })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
