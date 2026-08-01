import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewNameChangeRequestDto {
  @ApiProperty({ enum: ['approved', 'rejected'], example: 'approved' })
  @IsEnum(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @ApiPropertyOptional({ example: 'Matched against government ID' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
