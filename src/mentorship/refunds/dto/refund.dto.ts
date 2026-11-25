import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class RefundTierDto {
  @ApiProperty({ example: 48, description: 'Applies when cancelled at least this many hours before start' })
  @Min(0)
  minHoursBeforeStart!: number;

  @ApiProperty({ example: 10000, description: 'Refund share in basis points' })
  @IsInt()
  @Min(0)
  @Max(10_000)
  refundBps!: number;
}

export class CancellationPolicySnapshotDto {
  @ApiProperty() @IsString() @Length(1, 64) version!: string;
  @ApiProperty({ example: 'Europe/Berlin' }) @IsString() @Length(1, 64) timeZone!: string;

  @ApiProperty({ type: [RefundTierDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundTierDto)
  tiers!: RefundTierDto[];

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  @Max(10_000)
  lateRefundBps!: number;
}

export class CalculateRefundDto {
  @ApiProperty() @IsString() @Length(1, 128) agreementId!: string;
  @ApiProperty({ minLength: 8 }) @IsString() @Length(8, 128) idempotencyKey!: string;

  @ApiProperty({ description: 'Escrowed amount in minor units' })
  @IsInt()
  @Min(0)
  heldAmountMinor!: number;

  @ApiProperty({ example: 'USDC' }) @IsString() @Length(1, 16) currency!: string;
  @ApiProperty() @Type(() => Date) @IsDate() sessionStart!: Date;
  @ApiProperty() @Type(() => Date) @IsDate() cancelledAt!: Date;

  @ApiProperty({ enum: ['learner', 'mentor', 'system'] })
  @IsIn(['learner', 'mentor', 'system'])
  cancelledBy!: 'learner' | 'mentor' | 'system';

  @ApiProperty({
    type: CancellationPolicySnapshotDto,
    description: 'The policy snapshotted onto the booking, not the live policy',
  })
  @ValidateNested()
  @Type(() => CancellationPolicySnapshotDto)
  policy!: CancellationPolicySnapshotDto;
}

export class RequestRefundExceptionDto {
  @ApiProperty({ example: 10000 }) @IsInt() @Min(0) @Max(10_000) requestedRefundBps!: number;
  @ApiProperty() @IsString() @Length(10, 1000) reason!: string;
}

export class DecideRefundExceptionDto {
  @ApiProperty() @IsIn([true, false]) approve!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
