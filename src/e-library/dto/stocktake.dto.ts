import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateStocktakeSessionDto {
  @ApiProperty({ description: 'Name/identifier for the stocktake session' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Branch to stocktake' })
  @IsString()
  @IsOptional()
  branch?: string;
}

export class RecordScanDto {
  @ApiProperty({ description: 'Barcode of the scanned copy' })
  @IsString()
  @IsNotEmpty()
  barcode: string;

  @ApiProperty({ description: 'Scan result', enum: ['found', 'missing', 'misshelved', 'damaged', 'extra'] })
  @IsString()
  @IsNotEmpty()
  result: string;

  @ApiPropertyOptional({ description: 'Expected location' })
  @IsString()
  @IsOptional()
  expectedLocation?: string;

  @ApiPropertyOptional({ description: 'Actual location found' })
  @IsString()
  @IsOptional()
  actualLocation?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  note?: string;
}

export class ReconcileStocktakeDto {
  @ApiProperty({ description: 'Action for missing copies', enum: ['mark_lost', 'mark_withdrawn', 'skip'] })
  @IsString()
  @IsNotEmpty()
  missingAction: string;

  @ApiProperty({ description: 'Action for misshelved copies', enum: ['relocate', 'skip'] })
  @IsString()
  @IsNotEmpty()
  misshelvedAction: string;

  @ApiProperty({ description: 'Action for damaged copies', enum: ['mark_damaged', 'mark_in_repair', 'skip'] })
  @IsString()
  @IsNotEmpty()
  damagedAction: string;

  @ApiProperty({ description: 'Action for extra copies', enum: ['add', 'skip'] })
  @IsString()
  @IsNotEmpty()
  extraAction: string;
}
