import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateAboutContentRevisionDto {
  @ApiPropertyOptional({ example: 'About Us (Updated)' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Updated content...' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'Updated preview...' })
  @IsOptional()
  @IsString()
  preview?: string;
}
