import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
} from 'class-validator';
import { IsStellarPublicKey } from '../../common/validators/is-stellar-public-key.validator';
import {
  ScholarshipAssetStatus,
  ScholarshipAssetType,
  StellarNetwork,
} from '../domain/scholarship-asset.rules';

/** Identifiers for programs are opaque, tenant-scoped slugs or ids. */
export const PROGRAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export class ProposeScholarshipAssetDto {
  @ApiProperty({ example: 'stem-2026' })
  @Matches(PROGRAM_ID_PATTERN, {
    message: 'programId must be 1-64 characters of letters, digits, _ or -',
  })
  programId!: string;

  @ApiProperty({ enum: StellarNetwork })
  @IsEnum(StellarNetwork)
  network!: StellarNetwork;

  @ApiProperty({ enum: ScholarshipAssetType })
  @IsEnum(ScholarshipAssetType)
  assetType!: ScholarshipAssetType;

  @ApiProperty({ example: 'USDC', description: 'Use "XLM" for native' })
  @Matches(/^[A-Za-z0-9]{1,12}$/)
  code!: string;

  @ApiPropertyOptional({ description: 'Issuer account; omit for native XLM' })
  @ValidateIf(
    (o: ProposeScholarshipAssetDto) =>
      o.assetType !== ScholarshipAssetType.NATIVE,
  )
  @IsString()
  @Validate(IsStellarPublicKey)
  issuer?: string;

  @ApiProperty({ minimum: 0, maximum: 7, example: 2 })
  @IsInt()
  @Min(0)
  @Max(7)
  decimals!: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    description: 'Overrides SCHOLARSHIP_REQUIRED_CONFIRMATIONS for this asset',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  requiredConfirmations?: number;
}

export class DisableScholarshipAssetDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ListScholarshipAssetsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(PROGRAM_ID_PATTERN)
  programId?: string;

  @ApiPropertyOptional({ enum: ScholarshipAssetStatus })
  @IsOptional()
  @IsEnum(ScholarshipAssetStatus)
  status?: ScholarshipAssetStatus;
}
