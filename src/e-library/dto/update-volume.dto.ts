import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateVolumeDto {
  @ApiPropertyOptional({
    description: 'Series to assign the book to',
  })
  @IsOptional()
  @IsMongoId()
  seriesId?: string;

  @ApiPropertyOptional({
    description:
      'Volume number within the series. Supports decimals for special labels, e.g. 1.5, 2.0',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeNumber?: number;

  @ApiPropertyOptional({
    description: 'Special volume label, e.g. "Prologue", "Epilogue"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  volumeLabel?: string;
}
