import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Min,
} from 'class-validator';
import { ChargeType } from '../enums/charge-type.enum';

export class CreateChargePolicyDto {
  @ApiProperty({ enum: ChargeType, example: ChargeType.OVERDUE_FINE })
  @IsIn(Object.values(ChargeType))
  chargeType: ChargeType;

  @ApiProperty({ example: 'USD' })
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code',
  })
  currency: string;

  @ApiProperty({
    example: 3,
    description: 'Grace period, in whole days, before charges accrue',
  })
  @IsInt()
  @Min(0)
  graceDays: number;

  @ApiProperty({
    example: 50,
    description: 'Charge accrued per day past the grace period, in minor units',
  })
  @IsInt()
  @Min(0)
  dailyRateMinorUnits: number;

  @ApiProperty({
    example: 5000,
    description: 'Maximum charge this policy can ever produce, in minor units',
  })
  @IsInt()
  @Min(0)
  capMinorUnits: number;

  @ApiProperty({
    required: false,
    example: '2026-09-01T00:00:00.000Z',
    description:
      'Defaults to now. Any currently open-ended policy of the same chargeType+currency is closed at this timestamp.',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
