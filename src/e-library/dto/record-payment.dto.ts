import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator';

export class RecordPaymentDto {
  @ApiProperty({ example: '64f1c2b5e1b1c2a1b8e4a111' })
  @IsString()
  @IsNotEmpty()
  patronId: string;

  @ApiProperty({
    example: 1500,
    description: 'Amount paid, in minor currency units',
  })
  @IsInt()
  @Min(1)
  amountMinorUnits: number;

  @ApiProperty({ example: 'USD' })
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code',
  })
  currency: string;

  @ApiProperty({ example: 'Cash payment at front desk' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
