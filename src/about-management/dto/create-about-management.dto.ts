import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAboutContentRevisionDto {
  @ApiProperty({ example: 'About Us' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Welcome to our platform...' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ example: 'Welcome to our platform...' })
  @IsOptional()
  @IsString()
  preview?: string;
}
