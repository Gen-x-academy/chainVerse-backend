import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsEnum,
  IsInt,
  Min,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { AcquisitionItemFormat } from '../schemas/acquisition-order.schema';

export class CreateAcquisitionOrderItemDto {
  @ApiProperty({ example: 'Dune' })
  @IsString()
  @IsNotEmpty()
  bookTitle: string;

  @ApiProperty({ example: 'Frank Herbert' })
  @IsString()
  @IsNotEmpty()
  author: string;

  @ApiPropertyOptional({ example: '978-0441013593' })
  @IsString()
  @IsOptional()
  isbn?: string;

  @ApiProperty({ enum: AcquisitionItemFormat, example: AcquisitionItemFormat.PHYSICAL })
  @IsEnum(AcquisitionItemFormat)
  format: AcquisitionItemFormat;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  quantityOrdered: number;

  @ApiProperty({ example: 1299 })
  @IsInt()
  @Min(0)
  unitPriceMinorUnits: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;
}

export class CreateAcquisitionOrderDto {
  @ApiProperty({ example: 'PO-2026-001' })
  @IsString()
  @IsNotEmpty()
  orderNumber: string;

  @ApiProperty({ example: 'Baker & Taylor' })
  @IsString()
  @IsNotEmpty()
  supplier: string;

  @ApiProperty({ example: '2026-08-31' })
  @IsDateString()
  orderDate: string;

  @ApiProperty({ example: '2026-09-30' })
  @IsDateString()
  expectedDeliveryDate: string;

  @ApiProperty({ type: [CreateAcquisitionOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAcquisitionOrderItemDto)
  items: CreateAcquisitionOrderItemDto[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
