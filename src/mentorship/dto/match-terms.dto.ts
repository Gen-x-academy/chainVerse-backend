import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MatchTermsDto {
  @ApiProperty({ example: 4, minimum: 1, maximum: 31 })
  @IsInt()
  @Min(1)
  @Max(31)
  sessionsPerMonth!: number;

  @ApiProperty({ example: 60, minimum: 15, maximum: 240 })
  @IsInt()
  @Min(15)
  @Max(240)
  sessionLengthMinutes!: number;

  @ApiProperty({ example: 12, minimum: 1, maximum: 104 })
  @IsInt()
  @Min(1)
  @Max(104)
  durationWeeks!: number;

  @ApiProperty({
    example: '25.00',
    description: 'Non-negative decimal string with up to 7 fractional digits',
  })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,7})?$/, {
    message: 'pricePerSession must be a non-negative decimal string',
  })
  pricePerSession!: string;

  @ApiProperty({ example: 'USDC', description: 'Asset code, 3-12 uppercase alphanumerics' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9]{3,12}$/, {
    message: 'currency must be 3-12 uppercase alphanumeric characters',
  })
  currency!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
