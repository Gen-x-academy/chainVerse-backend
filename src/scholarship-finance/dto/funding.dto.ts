import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DepositRail, DepositStatus } from '../domain/finance.enums';
import {
  AmountMinorProperty,
  AssetDto,
  OBJECT_ID_PATTERN,
  PaginationQueryDto,
  PROGRAM_ID_PATTERN,
} from './common.dto';

export class CreateFundingRoundDto {
  @ApiProperty({ example: '2026 Spring Blockchain Scholarships' })
  @IsString()
  @Length(3, 200)
  name!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Restrict to a program; null = unrestricted pool.',
  })
  @IsOptional()
  @Matches(PROGRAM_ID_PATTERN)
  programId?: string | null;

  @ApiProperty({ type: AssetDto })
  @ValidateNested()
  @Type(() => AssetDto)
  asset!: AssetDto;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  targetMinor?: number | null;

  @ApiProperty()
  @IsDateString()
  opensAt!: string;

  @ApiProperty()
  @IsDateString()
  closesAt!: string;
}

export class ReasonDto {
  @ApiProperty()
  @IsString()
  @Length(5, 1000)
  reason!: string;
}

export class DepositSourceDto {
  @ApiProperty({ enum: DepositRail })
  @IsEnum(DepositRail)
  rail!: DepositRail;

  @ApiProperty({
    description:
      'Unique rail reference (Stellar tx hash, bank ref, PSP charge id).',
  })
  @IsString()
  @Length(4, 128)
  @Matches(/^[A-Za-z0-9:_\-.]+$/)
  reference!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  sourceAccount?: string | null;
}

export class RecordDepositDto {
  @ApiProperty({ description: 'Opaque sponsor identifier.' })
  @IsString()
  @Length(1, 128)
  sponsorId!: string;

  @ApiPropertyOptional({
    description: 'Funding round; its asset and allocation are enforced.',
  })
  @IsOptional()
  @Matches(OBJECT_ID_PATTERN)
  fundingRoundId?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Ignored when fundingRoundId is set; null = pool.',
  })
  @IsOptional()
  @Matches(PROGRAM_ID_PATTERN)
  programId?: string | null;

  @ApiProperty({ type: AssetDto })
  @ValidateNested()
  @Type(() => AssetDto)
  asset!: AssetDto;

  @AmountMinorProperty('Amount that actually arrived, before fees.')
  amountMinor!: number;

  @ApiProperty({ type: DepositSourceDto })
  @ValidateNested()
  @Type(() => DepositSourceDto)
  source!: DepositSourceDto;

  @ApiProperty()
  @IsDateString()
  receivedAt!: string;
}

export class ListDepositsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DepositStatus })
  @IsOptional()
  @IsEnum(DepositStatus)
  status?: DepositStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(OBJECT_ID_PATTERN)
  fundingRoundId?: string;
}

export class ReallocateFundsDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Source program; null = pool.',
  })
  @IsOptional()
  @Matches(PROGRAM_ID_PATTERN)
  fromProgramId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Destination program; null = pool.',
  })
  @IsOptional()
  @Matches(PROGRAM_ID_PATTERN)
  toProgramId?: string | null;

  @ApiProperty({ type: AssetDto })
  @ValidateNested()
  @Type(() => AssetDto)
  asset!: AssetDto;

  @AmountMinorProperty()
  amountMinor!: number;

  @ApiPropertyOptional({
    description: 'Deposit the reallocation relates to, if any.',
  })
  @IsOptional()
  @Matches(OBJECT_ID_PATTERN)
  depositId?: string;

  @ApiProperty()
  @IsString()
  @Length(5, 1000)
  reason!: string;
}
