import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ChargeType } from '../enums/charge-type.enum';

export class CreateChargeDto {
  @ApiProperty({ example: '64f1c2b5e1b1c2a1b8e4a111' })
  @IsString()
  @IsNotEmpty()
  patronId: string;

  @ApiProperty({ required: false, example: '64f1c2b5e1b1c2a1b8e4a333' })
  @IsOptional()
  @IsString()
  loanId?: string;

  @ApiProperty({ enum: ChargeType, example: ChargeType.LOST_ITEM_FEE })
  @IsIn(Object.values(ChargeType))
  chargeType: ChargeType;

  @ApiProperty({
    example: 1500,
    description: 'Amount in minor currency units (e.g. cents)',
  })
  @IsInt()
  @Min(1)
  amountMinorUnits: number;

  @ApiProperty({ example: 'USD' })
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code',
  })
  currency: string;

  @ApiProperty({ example: 'Book reported lost by patron' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
