import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsHexadecimal,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxDate,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
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

/** Rejects the literal amount "0" (the Joi schemas use `invalid('0')`). */
const NOT_ZERO_PATTERN = /^(?!0$)/;
const AMOUNT_MESSAGE = 'amount must be a non-zero decimal with up to 7 places';
const ADJUSTMENT = 'adjustment';

const amount = () => Joi.string().pattern(DECIMAL_AMOUNT_PATTERN).invalid('0');

export class LedgerLineDto {
  @ApiProperty({ enum: LEDGER_ACCOUNTS })
  @IsIn(LEDGER_ACCOUNTS)
  account!: LedgerAccount;

  @ApiProperty({ enum: ['debit', 'credit'] })
  @IsIn(['debit', 'credit'])
  direction!: 'debit' | 'credit';

  @ApiProperty({
    example: '100.5',
    description: 'Decimal amount, up to 7 places',
  })
  @IsString()
  @Matches(DECIMAL_AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  @Matches(NOT_ZERO_PATTERN, { message: AMOUNT_MESSAGE })
  amount!: string;
}

export class PostLedgerEntryDto {
  @ApiProperty({
    description: 'Unique (per organization) business reference',
    example: 'fund:grant-2026-q3',
  })
  @IsString()
  @Matches(REFERENCE_PATTERN, { message: 'reference is malformed' })
  reference!: string;

  @ApiProperty({ enum: POSTABLE_ENTRY_TYPES })
  @IsIn(POSTABLE_ENTRY_TYPES)
  entryType!: Exclude<LedgerEntryType, 'reversal'>;

  @ApiPropertyOptional({
    description: 'Required for every type except adjustment',
    example: '2500',
  })
  // Adjustments carry explicit lines instead of an amount.
  @ValidateIf((o: PostLedgerEntryDto) => o.entryType !== ADJUSTMENT)
  @IsString()
  @Matches(DECIMAL_AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  @Matches(NOT_ZERO_PATTERN, { message: AMOUNT_MESSAGE })
  amount?: string;

  @ApiPropertyOptional({
    type: [LedgerLineDto],
    description: 'Adjustment only: explicit balanced lines',
  })
  @ValidateIf((o: PostLedgerEntryDto) => o.entryType === ADJUSTMENT)
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => LedgerLineDto)
  lines?: LedgerLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({ description: 'Required for adjustments' })
  @ValidateIf(
    (o: PostLedgerEntryDto) => o.entryType === ADJUSTMENT || o.reason !== undefined,
  )
  @IsString()
  @Length(10, 1000)
  reason?: string;

  @ApiPropertyOptional()
  @ValidateIf(
    (o: PostLedgerEntryDto) =>
      ['award', 'award_cancellation', 'disbursement'].includes(o.entryType) ||
      o.awardId !== undefined,
  )
  @IsString()
  @Length(1, 128)
  awardId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 128)
  installmentId?: string;

  @ApiPropertyOptional({
    description: 'Stellar tx hash; required for funding, refund and recovery',
  })
  @ValidateIf(
    (o: PostLedgerEntryDto) =>
      ['funding', 'refund', 'recovery', 'disbursement'].includes(o.entryType) ||
      o.transactionHash !== undefined,
  )
  @IsString()
  @Matches(TX_HASH_PATTERN, {
    message: 'transactionHash must be 64 lowercase hex characters',
  })
  transactionHash?: string;

  @ApiPropertyOptional({
    description: 'Defaults to now; cannot be in the future',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(() => new Date(), { message: 'effectiveAt cannot be in the future' })
  effectiveAt?: Date;
}

/**
 * Partial update of a posted entry's descriptive fields. Ledger entries are
 * append-only: this DTO exists for metadata edits on drafts and is not wired
 * to a route that can change amounts or accounts of a posted entry.
 */
export class UpdateLedgerEntryDto extends PartialType(PostLedgerEntryDto) {}

export class ReverseLedgerEntryDto {
  @ApiProperty()
  @IsString()
  @Matches(REFERENCE_PATTERN, { message: 'reference is malformed' })
  reference!: string;

  @ApiProperty()
  @IsString()
  @Length(10, 1000)
  reason!: string;
}

export class ListLedgerEntriesQuery {
  @ApiPropertyOptional({ enum: LEDGER_ENTRY_TYPES })
  @IsOptional()
  @IsIn(LEDGER_ENTRY_TYPES)
  entryType?: LedgerEntryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 128)
  awardId?: string;

  @ApiPropertyOptional({
    description:
      'Return entries effective before this entry id (pagination cursor)',
  })
  @IsOptional()
  @IsHexadecimal()
  @Length(24, 24)
  before?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class BalancesQuery {
  @ApiPropertyOptional({ description: 'Point-in-time balances' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  asOf?: Date;
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
