import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { FeeEvent, FeeKind, RoundingMode } from '../domain/finance.enums';
import { AmountMinorProperty, AssetDto } from './common.dto';

export class FeeRuleDto {
  @ApiProperty({ enum: FeeKind })
  @IsEnum(FeeKind)
  kind!: FeeKind;

  @ApiProperty({ enum: FeeEvent })
  @IsEnum(FeeEvent)
  appliesTo!: FeeEvent;

  @ApiProperty({
    example: 150,
    description: 'Percentage fee in basis points (150 = 1.5%).',
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  basisPoints!: number;

  @ApiProperty({
    example: 0,
    description: 'Flat fee in minor units, added after the percentage.',
  })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  fixedMinor!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  minMinor?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  maxMinor?: number | null;
}

export class CreateFeeScheduleDto {
  @ApiProperty({ type: AssetDto })
  @ValidateNested()
  @Type(() => AssetDto)
  asset!: AssetDto;

  @ApiPropertyOptional({
    description:
      'Defaults to now. Must not be in the past (no retroactive fees).',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiProperty({ enum: RoundingMode })
  @IsEnum(RoundingMode)
  rounding!: RoundingMode;

  @ApiProperty({ type: [FeeRuleDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FeeRuleDto)
  rules!: FeeRuleDto[];

  @ApiProperty({ description: 'Why the fee basis changed (audited).' })
  @IsString()
  @Length(5, 1000)
  reason!: string;
}

export class FeePreviewDto {
  @ApiProperty({ type: AssetDto })
  @ValidateNested()
  @Type(() => AssetDto)
  asset!: AssetDto;

  @ApiProperty({ enum: FeeEvent })
  @IsEnum(FeeEvent)
  event!: FeeEvent;

  @AmountMinorProperty(
    'Deposit: amount received. Disbursement: amount the recipient must receive.',
  )
  amountMinor!: number;

  @ApiPropertyOptional({
    description:
      'Evaluate against the schedule effective at this time (default now).',
  })
  @IsOptional()
  @IsDateString()
  at?: string;
}
