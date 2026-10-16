import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CopyCondition } from '../schemas/book-copy.schema';

export enum ReturnDisposition {
  AVAILABLE = 'available',
  IN_REPAIR = 'in_repair',
  QUARANTINE = 'quarantine',
}

export class PhysicalReturnDto {
  @ApiProperty({ description: 'Barcode of the physical copy being returned' })
  @IsString()
  @IsNotEmpty()
  barcode: string;

  @ApiPropertyOptional({ enum: CopyCondition, description: 'Condition of the returned copy' })
  @IsEnum(CopyCondition)
  @IsOptional()
  condition?: CopyCondition;

  @ApiPropertyOptional({ enum: ReturnDisposition, description: 'Where to route the copy after return' })
  @IsEnum(ReturnDisposition)
  @IsOptional()
  disposition?: ReturnDisposition;

  @ApiPropertyOptional({ description: 'Notes about the return' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ description: 'ID of the staff processing the return' })
  @IsString()
  @IsOptional()
  staffId?: string;
}
