import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { STELLAR_NETWORKS } from '../scholarship-program.schema';

export const STELLAR_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;

class StellarAssetDto {
  @ApiProperty({ example: 'USDC' })
  code!: string;

  @ApiPropertyOptional({ description: 'Omit for native XLM' })
  issuer?: string;
}

export class CreateScholarshipProgramDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ type: StellarAssetDto }) asset!: StellarAssetDto;
  @ApiProperty({ enum: STELLAR_NETWORKS }) network!: 'testnet' | 'public';
  @ApiProperty({ description: 'Stellar account holding program funds' })
  treasuryAccount!: string;
  @ApiPropertyOptional({ enum: ['horizon', 'manual'], default: 'horizon' })
  externalBalanceSource?: 'horizon' | 'manual';
}

export class UpdateScholarshipProgramStatusDto {
  @ApiProperty({ enum: ['active', 'suspended', 'closed'] })
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
