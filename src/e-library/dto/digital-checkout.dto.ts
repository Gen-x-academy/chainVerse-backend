import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DigitalCheckoutDto {
  @ApiProperty({ description: 'ID of the borrower (patron)' })
  @IsString()
  @IsNotEmpty()
  patronId: string;

  @ApiProperty({ description: 'ID of the book edition' })
  @IsString()
  @IsNotEmpty()
  bookId: string;

  @ApiProperty({ description: 'Edition identifier (e.g., EPUB, PDF)' })
  @IsString()
  @IsNotEmpty()
  editionId: string;

  @ApiPropertyOptional({ description: 'Desired format' })
  @IsString()
  @IsOptional()
  format?: string;
}
