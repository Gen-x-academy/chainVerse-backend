import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PhysicalCheckoutDto {
  @ApiProperty({ description: 'Barcode of the physical copy to check out' })
  @IsString()
  @IsNotEmpty()
  barcode: string;

  @ApiProperty({ description: 'ID of the borrower (patron)' })
  @IsString()
  @IsNotEmpty()
  patronId: string;

  @ApiPropertyOptional({ description: 'ID of the librarian processing the checkout' })
  @IsString()
  @IsOptional()
  staffId?: string;
}
