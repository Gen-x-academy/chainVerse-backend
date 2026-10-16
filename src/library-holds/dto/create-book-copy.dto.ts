import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateBookCopyDto {
  @ApiPropertyOptional({
    description:
      'Barcode (physical) or license seat identifier (ebook). Auto-generated when omitted.',
    example: 'BC-000123',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  identifier?: string;
}
