import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { DECIMAL_AMOUNT_PATTERN } from '../../common/money';
import { STELLAR_ACCOUNT_PATTERN } from '../../programs/dto/program.dto';
import { TX_HASH_PATTERN } from '../../ledger/dto/ledger.dto';

export class CreatePayoutDto {
  @ApiProperty() awardId!: string;
  @ApiProperty() installmentId!: string;
  @ApiProperty({ description: 'User id of the scholarship recipient' })
  recipientId!: string;
  @ApiProperty({ description: 'Recipient Stellar account (G...)' })
  destination!: string;
  @ApiProperty({ example: '500' }) amount!: string;
}

export class RetryPayoutDto {
  @ApiPropertyOptional({
    description:
      'Corrected destination; required after a bad_destination failure',
  })
  destination?: string;
  @ApiProperty({ description: 'Operator note describing the fix applied' })
  note!: string;
}

export class CancelPayoutDto {
  @ApiProperty() reason!: string;
}

export class ListPayoutsQuery {
  @ApiPropertyOptional({
    enum: ['pending', 'submitted', 'failed', 'succeeded', 'cancelled'],
  })
  status?: string;
  @ApiPropertyOptional() awardId?: string;
  @ApiPropertyOptional({ default: 50 }) limit?: number;
}

class ResultCodesDto {
  @ApiPropertyOptional({ example: 'tx_failed' }) transaction?: string;
  @ApiPropertyOptional({ example: ['op_no_trust'] }) operations?: string[];
}

export class MarkAttemptSubmittedDto {
  @ApiProperty({ description: 'SHA-256 of the signed envelope XDR' })
  envelopeHash!: string;
  @ApiProperty() transactionHash!: string;
}

export class ReportAttemptResultDto {
  @ApiProperty({ enum: ['succeeded', 'failed'] }) outcome!:
    | 'succeeded'
    | 'failed';
  @ApiPropertyOptional() transactionHash?: string;
  @ApiPropertyOptional({ type: ResultCodesDto }) resultCodes?: ResultCodesDto;
  @ApiPropertyOptional({
    description: 'Signer-side error when no result codes exist',
  })
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
