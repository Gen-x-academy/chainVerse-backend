import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';

export class QueryProtocolsDto {
  @ApiPropertyOptional({
    example: 'aave',
    description: 'Filter by protocol name',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: 'lending',
    enum: ['lending', 'dex', 'yield', 'staking', 'other'],
    description: 'Filter by protocol type',
  })
  @IsEnum(['lending', 'dex', 'yield', 'staking', 'other'])
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    example: ['ethereum', 'polygon'],
    description: 'Filter by supported chains',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  chains?: string[];
}
