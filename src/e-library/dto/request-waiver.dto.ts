import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { LedgerEntryType } from '../enums/ledger-entry-type.enum';

export class RequestWaiverDto {
  @ApiProperty({
    example: '64f1c2b5e1b1c2a1b8e4a444',
    description: 'The LedgerEntry id of the charge to waive or adjust',
  })
  @IsString()
  @IsNotEmpty()
  chargeEntryId: string;

  @ApiProperty({
    enum: [LedgerEntryType.WAIVER, LedgerEntryType.ADJUSTMENT],
    example: LedgerEntryType.WAIVER,
  })
  @IsIn([LedgerEntryType.WAIVER, LedgerEntryType.ADJUSTMENT])
  entryType: LedgerEntryType.WAIVER | LedgerEntryType.ADJUSTMENT;

  @ApiProperty({
    example: 500,
    description:
      'Magnitude to waive/adjust, in minor currency units. Always a positive number here; the ledger records it with the correct sign.',
  })
  @IsInt()
  @Min(1)
  amountMinorUnits: number;

  @ApiProperty({ example: 'Patron disputed fine due to library closure' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
