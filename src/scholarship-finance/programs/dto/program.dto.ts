import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import * as Joi from 'joi';
import { STELLAR_NETWORKS } from '../scholarship-program.schema';

export const STELLAR_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;

export class StellarAssetDto {
  @ApiProperty({ example: 'USDC' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,12}$/, {
    message: 'code must be 1-12 alphanumeric characters',
  })
  code!: string;

  @ApiPropertyOptional({ description: 'Omit for native XLM' })
  // Native XLM has no issuer; every other asset needs one.
  @ValidateIf((o: StellarAssetDto) => o.code !== 'XLM')
  @IsString()
  @Matches(STELLAR_ACCOUNT_PATTERN, {
    message: 'issuer must be a Stellar account (G...)',
  })
  issuer?: string;
}

export class CreateScholarshipProgramDto {
  @ApiProperty()
  @IsString()
  @Length(3, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @ApiProperty({ type: StellarAssetDto })
  @ValidateNested()
  @Type(() => StellarAssetDto)
  asset!: StellarAssetDto;

  @ApiProperty({ enum: STELLAR_NETWORKS })
  @IsIn(STELLAR_NETWORKS)
  network!: 'testnet' | 'public';

  @ApiProperty({ description: 'Stellar account holding program funds' })
  @IsString()
  @Matches(STELLAR_ACCOUNT_PATTERN, {
    message: 'treasuryAccount must be a Stellar account (G...)',
  })
  treasuryAccount!: string;

  @ApiPropertyOptional({ enum: ['horizon', 'manual'], default: 'horizon' })
  @IsOptional()
  @IsIn(['horizon', 'manual'])
  externalBalanceSource?: 'horizon' | 'manual';
}

/** Partial update of a program; every field of the create DTO is optional. */
export class UpdateScholarshipProgramDto extends PartialType(
  CreateScholarshipProgramDto,
) {}

export class UpdateScholarshipProgramStatusDto {
  @ApiProperty({ enum: ['active', 'suspended', 'closed'] })
  @IsNotEmpty()
  @IsIn(['active', 'suspended', 'closed'])
  status!: 'active' | 'suspended' | 'closed';
}

const assetSchema = Joi.object({
  code: Joi.string()
    .pattern(/^[A-Za-z0-9]{1,12}$/)
    .required(),
  issuer: Joi.when('code', {
    is: 'XLM',
    then: Joi.forbidden(),
    otherwise: Joi.string().pattern(STELLAR_ACCOUNT_PATTERN).required(),
  }),
});

export const createScholarshipProgramSchema =
  Joi.object<CreateScholarshipProgramDto>({
    name: Joi.string().trim().min(3).max(120).required(),
    description: Joi.string().trim().max(2000),
    asset: assetSchema.required(),
    network: Joi.string()
      .valid(...STELLAR_NETWORKS)
      .required(),
    treasuryAccount: Joi.string().pattern(STELLAR_ACCOUNT_PATTERN).required(),
    externalBalanceSource: Joi.string()
      .valid('horizon', 'manual')
      .default('horizon'),
  });

export const updateScholarshipProgramStatusSchema =
  Joi.object<UpdateScholarshipProgramStatusDto>({
    status: Joi.string().valid('active', 'suspended', 'closed').required(),
  });
