import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  Length,
  Matches,
} from 'class-validator';

/**
 * Payload to settle a library charge via an on-chain Stellar transaction.
 *
 * The `transactionHash` is idempotent: submitting the same hash twice for the
 * same charge returns the existing result rather than double-posting.
 */
export class PayLibraryChargeDto {
  @ApiProperty({
    description: 'ID of the LedgerEntry (charge) to settle',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  chargeEntryId: string;

  @ApiProperty({
    description:
      'Stellar asset code of the payment (e.g. XLM, USDC). Must be supported by the library.',
    example: 'XLM',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 12)
  asset: string;

  @ApiProperty({
    description:
      'Amount to pay in minor currency units (e.g. cents for USD). Must be positive and ≥ the charge amount.',
    example: 500,
  })
  @IsInt()
  @Min(1)
  amountMinorUnits: number;

  @ApiProperty({
    description: 'ISO 4217 currency code matching the charge entry',
    example: 'USD',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  currency: string;

  @ApiProperty({
    description: 'Stellar public key (G…) of the receiving account',
    example: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z0-9]{55}$/, {
    message: 'destination must be a valid Stellar public key (G…)',
  })
  destination: string;

  @ApiPropertyOptional({
    description: 'Optional Stellar memo attached to the transaction',
    example: 'Library charge #507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  @Length(0, 28)
  memo?: string;

  @ApiProperty({
    description: 'Stellar transaction hash to verify on-chain',
    example:
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  })
  @IsString()
  @IsNotEmpty()
  @Length(64, 64)
  transactionHash: string;
}
