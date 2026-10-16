import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { DisbursementIntentStatus } from '../scholarship.constants';

export class CreateDisbursementIntentDto {
  @ApiProperty({ description: 'Payment eligibility the intent pays out' })
  @IsMongoId()
  eligibilityId!: string;
}

const EXECUTION_STATUSES = [
  DisbursementIntentStatus.SUBMITTED,
  DisbursementIntentStatus.CONFIRMED,
  DisbursementIntentStatus.FAILED,
  DisbursementIntentStatus.CANCELLED,
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export class RecordIntentTransitionDto {
  @ApiProperty({ enum: EXECUTION_STATUSES })
  @IsIn(EXECUTION_STATUSES)
  status!: ExecutionStatus;

  @ApiPropertyOptional({
    description:
      'Executor handle (e.g. Stellar transaction hash). Required for `submitted`.',
  })
  @ValidateIf(
    (o: RecordIntentTransitionDto) =>
      o.status === DisbursementIntentStatus.SUBMITTED ||
      o.externalReference !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  externalReference?: string;

  @ApiPropertyOptional({ description: 'Required for `failed` and `cancelled`' })
  @ValidateIf(
    (o: RecordIntentTransitionDto) =>
      o.status === DisbursementIntentStatus.FAILED ||
      o.status === DisbursementIntentStatus.CANCELLED ||
      o.reason !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}

export class ListDisbursementIntentsDto {
  @ApiPropertyOptional({ enum: DisbursementIntentStatus })
  @IsOptional()
  @IsIn(Object.values(DisbursementIntentStatus))
  status?: DisbursementIntentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  awardId?: string;
}
