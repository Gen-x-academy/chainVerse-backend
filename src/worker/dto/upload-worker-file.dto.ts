import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadWorkerFileDto {
  @ApiProperty({ required: false, maxLength: 200 })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ required: false, maxLength: 2000 })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    required: false,
    description: 'Comma-separated tags',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  tags?: string;
}
