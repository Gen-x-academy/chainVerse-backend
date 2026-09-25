import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SanctionType } from '../schemas/sanction.schema';

export class CreateSanctionDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty({ enum: SanctionType })
  @IsEnum(SanctionType)
  type: SanctionType;

  @ApiProperty()
  @IsString()
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
