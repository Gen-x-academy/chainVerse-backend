import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';
import { IsStellarPublicKey } from '../../common/validators/is-stellar-public-key.validator';

export class CreateScholarshipAwardDto {
  @ApiProperty({ description: 'User id of the award recipient' })
  @IsMongoId()
  recipientId!: string;

  @ApiProperty({ description: 'Stellar account that receives disbursements' })
  @IsString()
  @Validate(IsStellarPublicKey)
  recipientWallet!: string;

  @ApiProperty({ example: 'Spring 2027 Blockchain Fundamentals Scholarship' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'USDC', description: 'Asset code (1–12 chars)' })
  @Matches(/^[A-Z0-9]{1,12}$/, {
    message: 'currency must be an upper-case asset code of 1–12 characters',
  })
  currency!: string;

  @ApiProperty({
    example: 500000000,
    description: 'Award total in integer minor units',
  })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  totalAmountMinor!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodStart?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodEnd?: Date;
}
