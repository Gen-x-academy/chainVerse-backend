import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { DECIMAL_AMOUNT_PATTERN } from '../../common/money';
import {
  LEDGER_ACCOUNTS,
  LEDGER_ENTRY_TYPES,
  POSTABLE_ENTRY_TYPES,
} from '../ledger-accounts';
import type { LedgerAccount, LedgerEntryType } from '../ledger-accounts';

export const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_\-.]{0,127}$/;
export const TX_HASH_PATTERN = /^[a-f0-9]{64}$/;

const amount = () => Joi.string().pattern(DECIMAL_AMOUNT_PATTERN).invalid('0');

export class LedgerLineDto {
  @ApiProperty({ enum: LEDGER_ACCOUNTS }) account!: LedgerAccount;
  @ApiProperty({ enum: ['debit', 'credit'] }) direction!: 'debit' | 'credit';
  @ApiProperty({
    example: '100.5',
    description: 'Decimal amount, up to 7 places',
  })
  amount!: string;
}

export class PostLedgerEntryDto {
  @ApiProperty({
    description: 'Unique (per organization) business reference',
    example: 'fund:grant-2026-q3',
  })
  reference!: string;

  @ApiProperty({ enum: POSTABLE_ENTRY_TYPES })
  entryType!: Exclude<LedgerEntryType, 'reversal'>;

  @ApiPropertyOptional({
    description: 'Required for every type except adjustment',
    example: '2500',
  })
  amount?: string;

  @ApiPropertyOptional({
    type: [LedgerLineDto],
    description: 'Adjustment only: explicit balanced lines',
  })
  lines?: LedgerLineDto[];

  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional({ description: 'Required for adjustments' })
  reason?: string;
  @ApiPropertyOptional() awardId?: string;
  @ApiPropertyOptional() installmentId?: string;

  @ApiPropertyOptional({
    description: 'Stellar tx hash; required for funding, refund and recovery',
  })
  transactionHash?: string;

  @ApiPropertyOptional({
    description: 'Defaults to now; cannot be in the future',
  })
  effectiveAt?: Date;
}

export class ReverseLedgerEntryDto {
  @ApiProperty() reference!: string;
  @ApiProperty() reason!: string;
}

export class ListLedgerEntriesQuery {
  @ApiPropertyOptional({ enum: LEDGER_ENTRY_TYPES })
  entryType?: LedgerEntryType;
  @ApiPropertyOptional() awardId?: string;
  @ApiPropertyOptional({
    description:
      'Return entries effective before this entry id (pagination cursor)',
  })
  before?: string;
  @ApiPropertyOptional({ default: 50, maximum: 200 }) limit?: number;
}

export class BalancesQuery {
  @ApiPropertyOptional({ description: 'Point-in-time balances' }) asOf?: Date;
}

const ledgerLineSchema = Joi.object({
  account: Joi.string()
    .valid(...LEDGER_ACCOUNTS)
    .required(),
  direction: Joi.string().valid('debit', 'credit').required(),
  amount: amount().required(),
});

export const postLedgerEntrySchema = Joi.object<PostLedgerEntryDto>({
  reference: Joi.string().pattern(REFERENCE_PATTERN).required(),
  entryType: Joi.string()
    .valid(...POSTABLE_ENTRY_TYPES)
    .required(),
  amount: Joi.when('entryType', {
    is: 'adjustment',
    then: Joi.forbidden(),
    otherwise: amount().required(),
  }),
  lines: Joi.when('entryType', {
    is: 'adjustment',
    then: Joi.array().items(ledgerLineSchema).min(2).max(10).required(),
    otherwise: Joi.forbidden(),
  }),
  description: Joi.string().trim().max(500),
  reason: Joi.when('entryType', {
    is: 'adjustment',
    then: Joi.string().trim().min(10).max(1000).required(),
    otherwise: Joi.string().trim().max(1000),
  }),
  awardId: Joi.string()
    .trim()
    .max(128)
    .when('entryType', {
      is: Joi.valid('award', 'award_cancellation', 'disbursement'),
      then: Joi.required(),
    }),
  installmentId: Joi.string().trim().max(128),
  transactionHash: Joi.string()
    .lowercase()
    .pattern(TX_HASH_PATTERN)
    .when('entryType', {
      is: Joi.valid('funding', 'refund', 'recovery', 'disbursement'),
      then: Joi.required(),
    }),
  effectiveAt: Joi.date().iso().max('now'),
});

export const reverseLedgerEntrySchema = Joi.object<ReverseLedgerEntryDto>({
  reference: Joi.string().pattern(REFERENCE_PATTERN).required(),
  reason: Joi.string().trim().min(10).max(1000).required(),
});

export const listLedgerEntriesSchema = Joi.object<ListLedgerEntriesQuery>({
  entryType: Joi.string().valid(...LEDGER_ENTRY_TYPES),
  awardId: Joi.string().max(128),
  before: Joi.string().hex().length(24),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

export const balancesQuerySchema = Joi.object<BalancesQuery>({
  asOf: Joi.date().iso(),
});
