import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const PROGRAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export class AssetDto {
  @ApiProperty({
    example: 'USDC',
    description: 'Asset code (1-12 alphanumeric chars).',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,12}$/)
  code!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    description:
      'Stellar issuer account; omit or null for the native asset / fiat.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/)
  issuer?: string | null;
}

/** Integer minor units (stroops, cents). Fractions are rejected, not rounded. */
export function AmountMinorProperty(
  description = 'Amount in integer minor units of the asset.',
) {
  return function (target: object, key: string) {
    ApiProperty({ example: 1500000, description, minimum: 1 })(target, key);
    IsInt()(target, key);
    Min(1)(target, key);
    Max(Number.MAX_SAFE_INTEGER)(target, key);
  };
}

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
