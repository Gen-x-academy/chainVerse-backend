import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { FundingModel } from '../entities';

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export class FundingAssetDto {
  @ApiProperty({ example: 'USDC' })
  @IsString()
  @Matches(/^[A-Z0-9]{2,12}$/)
  code: string;

  @ApiPropertyOptional({ example: 'GABC...XYZ' })
  @IsOptional()
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/)
  issuer?: string;
}

export class FundingRecipientDto {
  @ApiProperty({ example: 'member-7' })
  @IsString()
  @Matches(ID_PATTERN)
  memberId: string;

  @ApiProperty({ example: 7000, minimum: 0, maximum: 10000 })
  @IsInt()
  @Min(0)
  @Max(10000)
  shareBps: number;
}

export class FundingFeesDto {
  @ApiProperty({ example: 250, minimum: 0, maximum: 1000 })
  @IsInt()
  @Min(0)
  @Max(1000)
  platformBps: number;

  @ApiProperty({ example: 100, minimum: 0 })
  @IsInt()
  @Min(0)
  flat: number;
}

export class ConfigureFundingModelDto {
  @ApiProperty({ example: 'cfg-01J9Z8Q7' })
  @IsString()
  @Matches(ID_PATTERN)
  requestId: string;

  @ApiProperty({ example: 'tenant-alpha' })
  @IsString()
  @Matches(ID_PATTERN)
  tenantId: string;

  @ApiProperty({ example: 'project-1' })
  @IsString()
  @Matches(ID_PATTERN)
  projectId: string;

  @ApiProperty({ enum: FundingModel, example: FundingModel.GRANT })
  @IsEnum(FundingModel)
  model: FundingModel;

  @ApiProperty({ type: FundingAssetDto })
  @ValidateNested()
  @Type(() => FundingAssetDto)
  asset: FundingAssetDto;

  @ApiProperty({ example: 'member-1' })
  @IsString()
  @Matches(ID_PATTERN)
  payerId: string;

  @ApiProperty({ type: [FundingRecipientDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FundingRecipientDto)
  recipients: FundingRecipientDto[];

  @ApiProperty({ type: FundingFeesDto })
  @ValidateNested()
  @Type(() => FundingFeesDto)
  fees: FundingFeesDto;

  @ApiProperty({ example: 100000, minimum: 0 })
  @IsInt()
  @Min(0)
  committedAmountMinor: number;

  @ApiProperty({ example: 0, minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @ApiProperty({ example: '2027-01-01T00:00:00.000Z' })
  @IsISO8601()
  fundingExpiresAt: string;
}
