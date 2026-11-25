import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import * as Joi from 'joi';
import { DECIMAL_AMOUNT_PATTERN } from '../../common/money';
import { STELLAR_ACCOUNT_PATTERN } from '../../programs/dto/program.dto';
import { TX_HASH_PATTERN } from '../../ledger/dto/ledger.dto';

const ID_PATTERN = /^[A-Za-z0-9:_\-.]{1,128}$/;
const ID_MESSAGE = 'must be 1-128 characters of letters, digits, : _ - .';
const PAYOUT_STATUSES = [
  'pending',
  'submitted',
  'failed',
  'succeeded',
  'cancelled',
];

export class CreatePayoutDto {
  @ApiProperty()
  @IsString()
  @Matches(ID_PATTERN, { message: `awardId ${ID_MESSAGE}` })
  awardId!: string;

  @ApiProperty()
  @IsString()
  @Matches(ID_PATTERN, { message: `installmentId ${ID_MESSAGE}` })
  installmentId!: string;

  @ApiProperty({ description: 'User id of the scholarship recipient' })
  @IsString()
  @Matches(ID_PATTERN, { message: `recipientId ${ID_MESSAGE}` })
  recipientId!: string;

  @ApiProperty({ description: 'Recipient Stellar account (G...)' })
  @IsString()
  @Matches(STELLAR_ACCOUNT_PATTERN, {
    message: 'destination must be a Stellar account (G...)',
  })
  destination!: string;

  @ApiProperty({ example: '500' })
  @IsString()
  @Matches(DECIMAL_AMOUNT_PATTERN, {
    message: 'amount must be a decimal with up to 7 places',
  })
  @Matches(/^(?!0$)/, { message: 'amount must not be zero' })
  amount!: string;
}

/** Partial update of a pending payout; every create field is optional. */
export class UpdatePayoutDto extends PartialType(CreatePayoutDto) {}

export class RetryPayoutDto {
  @ApiPropertyOptional({
    description:
      'Corrected destination; required after a bad_destination failure',
  })
  @IsOptional()
  @IsString()
  @Matches(STELLAR_ACCOUNT_PATTERN, {
    message: 'destination must be a Stellar account (G...)',
  })
  destination?: string;

  @ApiProperty({ description: 'Operator note describing the fix applied' })
  @IsString()
  @Length(5, 1000)
  note!: string;
}

export class CancelPayoutDto {
  @ApiProperty()
  @IsString()
  @Length(5, 1000)
  reason!: string;
}

export class ListPayoutsQuery {
  @ApiPropertyOptional({ enum: PAYOUT_STATUSES })
  @IsOptional()
  @IsIn(PAYOUT_STATUSES)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(ID_PATTERN, { message: `awardId ${ID_MESSAGE}` })
  awardId?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ResultCodesDto {
  @ApiPropertyOptional({ example: 'tx_failed' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  transaction?: string;

  @ApiPropertyOptional({ example: ['op_no_trust'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  operations?: string[];
}

export class MarkAttemptSubmittedDto {
  @ApiProperty({ description: 'SHA-256 of the signed envelope XDR' })
  @IsString()
  @Matches(TX_HASH_PATTERN, {
    message: 'envelopeHash must be 64 lowercase hex characters',
  })
  envelopeHash!: string;

  @ApiProperty()
  @IsString()
  @Matches(TX_HASH_PATTERN, {
    message: 'transactionHash must be 64 lowercase hex characters',
  })
  transactionHash!: string;
}

export class ReportAttemptResultDto {
  @ApiProperty({ enum: ['succeeded', 'failed'] })
  @IsIn(['succeeded', 'failed'])
  outcome!: 'succeeded' | 'failed';

  @ApiPropertyOptional()
  // A succeeded attempt must name its transaction.
  @ValidateIf(
    (o: ReportAttemptResultDto) =>
      o.outcome === 'succeeded' || o.transactionHash !== undefined,
  )
  @IsString()
  @Matches(TX_HASH_PATTERN, {
    message: 'transactionHash must be 64 lowercase hex characters',
  })
  transactionHash?: string;

  @ApiPropertyOptional({ type: ResultCodesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ResultCodesDto)
  resultCodes?: ResultCodesDto;

  @ApiPropertyOptional({
    description: 'Signer-side error when no result codes exist',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  signerError?: string;
}

const id = () =>
  Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9:_\-.]{1,128}$/);

export const createPayoutSchema = Joi.object<CreatePayoutDto>({
  awardId: id().required(),
  installmentId: id().required(),
  recipientId: id().required(),
  destination: Joi.string().pattern(STELLAR_ACCOUNT_PATTERN).required(),
  amount: Joi.string().pattern(DECIMAL_AMOUNT_PATTERN).invalid('0').required(),
});

export const retryPayoutSchema = Joi.object<RetryPayoutDto>({
  destination: Joi.string().pattern(STELLAR_ACCOUNT_PATTERN),
  note: Joi.string().trim().min(5).max(1000).required(),
});

export const cancelPayoutSchema = Joi.object<CancelPayoutDto>({
  reason: Joi.string().trim().min(5).max(1000).required(),
});

export const listPayoutsSchema = Joi.object<ListPayoutsQuery>({
  status: Joi.string().valid(
    'pending',
    'submitted',
    'failed',
    'succeeded',
    'cancelled',
  ),
  awardId: id(),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

export const markAttemptSubmittedSchema = Joi.object<MarkAttemptSubmittedDto>({
  envelopeHash: Joi.string().lowercase().pattern(TX_HASH_PATTERN).required(),
  transactionHash: Joi.string().lowercase().pattern(TX_HASH_PATTERN).required(),
});

export const reportAttemptResultSchema = Joi.object<ReportAttemptResultDto>({
  outcome: Joi.string().valid('succeeded', 'failed').required(),
  transactionHash: Joi.string()
    .lowercase()
    .pattern(TX_HASH_PATTERN)
    .when('outcome', {
      is: 'succeeded',
      then: Joi.required(),
    }),
  resultCodes: Joi.object({
    transaction: Joi.string().max(64),
    operations: Joi.array().items(Joi.string().max(64)).max(100),
  }),
  signerError: Joi.string().max(2000),
}).or('transactionHash', 'resultCodes', 'signerError');
