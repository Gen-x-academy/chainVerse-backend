import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AssignBarcodeDto {
  @ApiProperty({ description: 'ID of the book copy' })
  @IsString()
  @IsNotEmpty()
  copyId: string;

  @ApiPropertyOptional({ description: 'Custom barcode to assign (auto-generated if omitted)' })
  @IsString()
  @IsOptional()
  barcode?: string;
}

export class ReassignBarcodeDto {
  @ApiProperty({ description: 'New barcode to assign' })
  @IsString()
  @IsNotEmpty()
  newBarcode: string;

  @ApiProperty({ description: 'Reason for reassignment' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
