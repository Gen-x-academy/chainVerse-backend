import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateClosureDto {
  @ApiProperty({
    description: 'Closure date (ISO 8601)',
    example: '2026-12-25',
  })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: 'Public holiday' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
