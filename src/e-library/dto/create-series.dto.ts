import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSeriesDto {
  @ApiProperty({ description: 'Unique name of the series' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Description of the series' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
