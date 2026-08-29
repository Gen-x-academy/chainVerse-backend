import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  Length,
} from 'class-validator';

/**
 * Declares a copy lost and assesses replacement and processing fees.
 */
export class DeclareLostItemDto {
  @ApiProperty({
    description: 'ID of the active loan associated with the lost copy',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  loanId: string;

  @ApiProperty({
    description:
      'Processing/administrative fee in minor currency units (non-refundable)',
    example: 1000,
  })
  @IsInt()
  @Min(0)
  processingFeeMinorUnits: number;

  @ApiProperty({
    description: 'Replacement cost of the physical copy in minor currency units',
    example: 2500,
  })
  @IsInt()
  @Min(0)
  replacementCostMinorUnits: number;

  @ApiProperty({
    description: 'ISO 4217 currency code for both fees',
    example: 'USD',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  currency: string;

  @ApiPropertyOptional({
    description: 'Optional note or reason for the declaration',
    example: 'Item not returned after 60-day overdue threshold',
  })
  @IsOptional()
  @IsString()
  declarationNote?: string;
}

/**
 * Processes the late return of a copy that was previously declared lost.
 * The replacement cost charge is reversed; the processing fee is retained.
 */
export class ProcessLostItemReturnDto {
  @ApiPropertyOptional({
    description: 'Optional note from the staff member processing the return',
    example: 'Copy returned in fair condition',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
