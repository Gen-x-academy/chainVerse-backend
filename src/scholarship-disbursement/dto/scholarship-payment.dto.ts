import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ScholarshipPaymentStatus } from '../domain/payment-state';
import { PROGRAM_ID_PATTERN } from './scholarship-asset.dto';

export class SchedulePaymentDto {
  @ApiProperty({ example: 'stem-2026' })
  @Matches(PROGRAM_ID_PATTERN)
  programId!: string;

  @ApiProperty({ description: 'User id of the recipient (an org member)' })
  @IsMongoId()
  recipientId!: string;

  @ApiProperty({ description: 'Active scholarship asset id for the program' })
  @IsMongoId()
  assetId!: string;

  @ApiProperty({ example: '250.00', description: 'Decimal string' })
  @Matches(/^\d{1,12}(\.\d{1,7})?$/, {
    message: 'amount must be a positive decimal with at most 7 fraction digits',
  })
  amount!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dueAt!: Date;

  @ApiProperty({
    example: 'award-8812/installment-2',
    description:
      'Caller key for this installment; scheduling the same key twice returns a conflict',
  })
  @Matches(/^[A-Za-z0-9._:/-]{1,128}$/)
  externalReference!: string;
}

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ enum: ScholarshipPaymentStatus })
  @IsOptional()
  @IsEnum(ScholarshipPaymentStatus)
  status?: ScholarshipPaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  recipientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(PROGRAM_ID_PATTERN)
  programId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class PaymentActionReasonDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class RecordReversalDto extends PaymentActionReasonDto {
  @ApiProperty({
    description:
      'Hash of the clawback or return-payment transaction evidencing the reversal',
  })
  @Matches(/^[0-9a-f]{64}$/, {
    message: 'transactionHash must be a 64-character lowercase hex hash',
  })
  transactionHash!: string;
}

export class RunDisbursementDto {
  @ApiPropertyOptional({ description: 'Restrict the run to one organization' })
  @IsOptional()
  @IsMongoId()
  organizationId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  batchSize?: number;
}
