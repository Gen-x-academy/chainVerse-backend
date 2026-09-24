import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { DepositRail, RefundStatus, RefundType } from '../domain/finance.enums';
import {
  AmountMinorProperty,
  AssetDto,
  OBJECT_ID_PATTERN,
  PaginationQueryDto,
  PROGRAM_ID_PATTERN,
} from './common.dto';

export class RefundDestinationDto {
  @ApiProperty({ enum: DepositRail })
  @IsEnum(DepositRail)
  rail!: DepositRail;

  @ApiProperty({
    description:
      'Destination account. Use a tokenized/masked reference for fiat rails.',
  })
  @IsString()
  @Length(1, 128)
  account!: string;
}

export class RequestRefundDto {
  @ApiProperty({ enum: RefundType })
  @IsEnum(RefundType)
  type!: RefundType;

  @ApiPropertyOptional({
    description: 'Required for all types except unused_balance.',
  })
  @IsOptional()
  @Matches(OBJECT_ID_PATTERN)
  depositId?: string;

  @ApiPropertyOptional({
    description: 'unused_balance only: sponsor receiving the balance.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  sponsorId?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'unused_balance only: fund to draw from; null = pool.',
  })
  @IsOptional()
  @Matches(PROGRAM_ID_PATTERN)
  programId?: string | null;

  @ApiPropertyOptional({
    type: AssetDto,
    description: 'unused_balance only (otherwise taken from the deposit).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssetDto)
  asset?: AssetDto;

  @AmountMinorProperty(
    'For rejected_transfer this must equal the deposit gross amount.',
  )
  amountMinor!: number;

  @ApiProperty()
  @IsString()
  @Length(5, 1000)
  reason!: string;

  @ApiPropertyOptional({
    type: RefundDestinationDto,
    description: 'Required except for rejected_transfer.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RefundDestinationDto)
  destination?: RefundDestinationDto;
}

export class CompleteRefundDto {
  @ApiProperty({
    description:
      'Payout rail reference (tx hash / bank ref), or the rail return reference.',
  })
  @IsString()
  @Length(4, 128)
  payoutReference!: string;
}

export class ListRefundsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RefundStatus })
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(OBJECT_ID_PATTERN)
  depositId?: string;
}
