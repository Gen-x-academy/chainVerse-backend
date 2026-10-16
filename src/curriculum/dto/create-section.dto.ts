import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSectionDto {
  @ApiProperty({ example: 'Getting started with Solidity' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Environment setup and first contract' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
