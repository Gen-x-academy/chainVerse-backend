import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAdminCertificateNameChangeReviewDto {
  @ApiProperty({ example: 'Certificate name-change review title', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Free-form key/value metadata',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
