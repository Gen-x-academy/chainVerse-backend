import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BalancesQuery,
  ListLedgerEntriesQuery,
  PostLedgerEntryDto,
  ReverseLedgerEntryDto,
  UpdateLedgerEntryDto,
} from '../ledger/dto/ledger.dto';
import {
  CancelPayoutDto,
  CreatePayoutDto,
  ListPayoutsQuery,
  MarkAttemptSubmittedDto,
  ReportAttemptResultDto,
  RetryPayoutDto,
  UpdatePayoutDto,
} from '../payouts/dto/payout.dto';
import {
  CreateScholarshipProgramDto,
  UpdateScholarshipProgramDto,
  UpdateScholarshipProgramStatusDto,
} from '../programs/dto/program.dto';

const ACCOUNT = `G${'A'.repeat(55)}`;
const HASH = 'a'.repeat(64);

async function errorsFor<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
  skipMissingProperties = false,
): Promise<string[]> {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { skipMissingProperties });
  const collect = (list: typeof errors, prefix = ''): string[] =>
    list.flatMap((e) => [
      ...(e.constraints ? [`${prefix}${e.property}`] : []),
      ...collect(e.children ?? [], `${prefix}${e.property}.`),
    ]);
  return collect(errors);
}

describe('CreateScholarshipProgramDto', () => {
  const valid = {
    name: 'STEM Fund',
    asset: { code: 'USDC', issuer: ACCOUNT },
    network: 'testnet',
    treasuryAccount: ACCOUNT,
  };

  it('accepts a valid program and native XLM without an issuer', async () => {
    expect(await errorsFor(CreateScholarshipProgramDto, valid)).toEqual([]);
    expect(
      await errorsFor(CreateScholarshipProgramDto, {
        ...valid,
        asset: { code: 'XLM' },
      }),
    ).toEqual([]);
  });

  it.each([
    ['a too-short name', { name: 'ab' }, 'name'],
    ['an unknown network', { network: 'mainnet' }, 'network'],
    ['a malformed treasury account', { treasuryAccount: 'GBAD' }, 'treasuryAccount'],
    ['an unknown balance source', { externalBalanceSource: 'oracle' }, 'externalBalanceSource'],
    ['an invalid asset code', { asset: { code: 'TOO-LONG-CODE!', issuer: ACCOUNT } }, 'asset.code'],
    ['a non-native asset without an issuer', { asset: { code: 'USDC' } }, 'asset.issuer'],
    ['a malformed issuer', { asset: { code: 'USDC', issuer: 'nope' } }, 'asset.issuer'],
  ])('rejects %s', async (_label, patch, field) => {
    expect(await errorsFor(CreateScholarshipProgramDto, { ...valid, ...patch })).toContain(
      field,
    );
  });

  it('requires every mandatory field', async () => {
    const errors = await errorsFor(CreateScholarshipProgramDto, {});
    expect(errors).toEqual(
      expect.arrayContaining(['name', 'asset', 'network', 'treasuryAccount']),
    );
  });
});

describe('UpdateScholarshipProgramDto (PartialType)', () => {
  it('accepts an empty or partial update', async () => {
    expect(await errorsFor(UpdateScholarshipProgramDto, {})).toEqual([]);
    expect(await errorsFor(UpdateScholarshipProgramDto, { name: 'Renamed Fund' })).toEqual([]);
  });

  it('still validates the fields it is given', async () => {
    expect(await errorsFor(UpdateScholarshipProgramDto, { name: 'x' })).toContain('name');
    expect(await errorsFor(UpdateScholarshipProgramDto, { network: 'x' })).toContain('network');
  });
});

describe('UpdateScholarshipProgramStatusDto', () => {
  it('accepts the three statuses and rejects anything else', async () => {
    for (const status of ['active', 'suspended', 'closed']) {
      expect(await errorsFor(UpdateScholarshipProgramStatusDto, { status })).toEqual([]);
    }
    expect(await errorsFor(UpdateScholarshipProgramStatusDto, { status: 'paused' })).toContain('status');
    expect(await errorsFor(UpdateScholarshipProgramStatusDto, {})).toContain('status');
  });
});

describe('PostLedgerEntryDto', () => {
  const funding = {
    reference: 'fund:grant-1',
    entryType: 'funding',
    amount: '2500',
    transactionHash: HASH,
  };

  it('accepts a funding entry', async () => {
    expect(await errorsFor(PostLedgerEntryDto, funding)).toEqual([]);
  });

  it.each([
    ['a malformed reference', { reference: '!bad ref' }, 'reference'],
    ['an unknown entry type', { entryType: 'gift' }, 'entryType'],
    ['a zero amount', { amount: '0' }, 'amount'],
    ['an amount with too many decimals', { amount: '1.12345678' }, 'amount'],
    ['a non-numeric amount', { amount: 'ten' }, 'amount'],
    ['a malformed transaction hash', { transactionHash: 'abc' }, 'transactionHash'],
    ['a future effectiveAt', { effectiveAt: '2999-01-01T00:00:00Z' }, 'effectiveAt'],
    ['an over-long description', { description: 'd'.repeat(501) }, 'description'],
  ])('rejects %s', async (_label, patch, field) => {
    expect(await errorsFor(PostLedgerEntryDto, { ...funding, ...patch })).toContain(field);
  });

  it('requires an amount and a transaction hash for funding', async () => {
    const errors = await errorsFor(PostLedgerEntryDto, {
      reference: 'fund:grant-2',
      entryType: 'funding',
    });
    expect(errors).toEqual(expect.arrayContaining(['amount', 'transactionHash']));
  });

  it('requires an award id for awards', async () => {
    const errors = await errorsFor(PostLedgerEntryDto, {
      reference: 'award:1',
      entryType: 'award',
      amount: '10',
    });
    expect(errors).toContain('awardId');
  });

  describe('adjustments', () => {
    const adjustment = {
      reference: 'adj:1',
      entryType: 'adjustment',
      reason: 'Correct a mis-posted fee',
      lines: [
        { account: 'cash', direction: 'debit', amount: '5' },
        { account: 'fees', direction: 'credit', amount: '5' },
      ],
    };

    it('needs no amount but needs lines and a reason', async () => {
      const errors = await errorsFor(PostLedgerEntryDto, {
        reference: 'adj:2',
        entryType: 'adjustment',
      });
      expect(errors).toEqual(expect.arrayContaining(['lines', 'reason']));
      expect(errors).not.toContain('amount');
    });

    it('rejects fewer than two lines', async () => {
      const errors = await errorsFor(PostLedgerEntryDto, {
        ...adjustment,
        lines: [adjustment.lines[0]],
      });
      expect(errors).toContain('lines');
    });

    it('validates each line', async () => {
      const errors = await errorsFor(PostLedgerEntryDto, {
        ...adjustment,
        lines: [
          { account: 'cash', direction: 'sideways', amount: '5' },
          { account: 'fees', direction: 'credit', amount: '0' },
        ],
      });
      expect(errors).toEqual(
        expect.arrayContaining(['lines.0.direction', 'lines.1.amount']),
      );
    });

    it('rejects a too-short reason', async () => {
      expect(await errorsFor(PostLedgerEntryDto, { ...adjustment, reason: 'short' })).toContain('reason');
    });
  });
});

describe('UpdateLedgerEntryDto (PartialType)', () => {
  it('accepts a partial payload but still validates present fields', async () => {
    expect(await errorsFor(UpdateLedgerEntryDto, { description: 'note' }, true)).toEqual([]);
    expect(await errorsFor(UpdateLedgerEntryDto, { reference: '!!' }, true)).toContain('reference');
  });
});

describe('ReverseLedgerEntryDto, ListLedgerEntriesQuery and BalancesQuery', () => {
  it('requires a reference and a reason of at least 10 characters', async () => {
    expect(await errorsFor(ReverseLedgerEntryDto, { reference: 'fund:1', reason: 'Posted twice by mistake' })).toEqual([]);
    expect(await errorsFor(ReverseLedgerEntryDto, { reference: 'fund:1', reason: 'short' })).toContain('reason');
    expect(await errorsFor(ReverseLedgerEntryDto, {})).toEqual(expect.arrayContaining(['reference', 'reason']));
  });

  it('bounds the list query', async () => {
    expect(await errorsFor(ListLedgerEntriesQuery, { limit: '50' })).toEqual([]);
    expect(await errorsFor(ListLedgerEntriesQuery, { limit: '0' })).toContain('limit');
    expect(await errorsFor(ListLedgerEntriesQuery, { limit: '201' })).toContain('limit');
    expect(await errorsFor(ListLedgerEntriesQuery, { limit: '1.5' })).toContain('limit');
    expect(await errorsFor(ListLedgerEntriesQuery, { entryType: 'gift' })).toContain('entryType');
    expect(await errorsFor(ListLedgerEntriesQuery, { before: 'zz' })).toContain('before');
    expect(await errorsFor(ListLedgerEntriesQuery, { before: 'a'.repeat(24) })).toEqual([]);
  });

  it('parses and checks asOf', async () => {
    expect(await errorsFor(BalancesQuery, { asOf: '2026-01-01T00:00:00Z' })).toEqual([]);
    expect(await errorsFor(BalancesQuery, { asOf: 'yesterday' })).toContain('asOf');
  });
});

describe('payout DTOs', () => {
  const payout = {
    awardId: 'award-1',
    installmentId: 'inst-1',
    recipientId: 'user-1',
    destination: ACCOUNT,
    amount: '500',
  };

  it('accepts a valid payout', async () => {
    expect(await errorsFor(CreatePayoutDto, payout)).toEqual([]);
  });

  it.each([
    ['a malformed award id', { awardId: 'bad id!' }, 'awardId'],
    ['a malformed destination', { destination: 'GNOPE' }, 'destination'],
    ['a zero amount', { amount: '0' }, 'amount'],
    ['a negative amount', { amount: '-5' }, 'amount'],
    ['an over-precise amount', { amount: '1.123456789' }, 'amount'],
  ])('rejects %s', async (_label, patch, field) => {
    expect(await errorsFor(CreatePayoutDto, { ...payout, ...patch })).toContain(field);
  });

  it('requires every field of a new payout', async () => {
    expect(await errorsFor(CreatePayoutDto, {})).toEqual(
      expect.arrayContaining(['awardId', 'installmentId', 'recipientId', 'destination', 'amount']),
    );
  });

  it('UpdatePayoutDto allows partial input and validates what is present', async () => {
    expect(await errorsFor(UpdatePayoutDto, {}, true)).toEqual([]);
    expect(await errorsFor(UpdatePayoutDto, { amount: '0' }, true)).toContain('amount');
  });

  it('validates retry and cancel payloads', async () => {
    expect(await errorsFor(RetryPayoutDto, { note: 'fixed the address' })).toEqual([]);
    expect(await errorsFor(RetryPayoutDto, { note: 'no' })).toContain('note');
    expect(await errorsFor(RetryPayoutDto, { note: 'fixed it', destination: 'x' })).toContain('destination');
    expect(await errorsFor(CancelPayoutDto, { reason: 'dup' })).toContain('reason');
    expect(await errorsFor(CancelPayoutDto, { reason: 'duplicate payout' })).toEqual([]);
  });

  it('validates the list query', async () => {
    expect(await errorsFor(ListPayoutsQuery, { status: 'failed', limit: '10' })).toEqual([]);
    expect(await errorsFor(ListPayoutsQuery, { status: 'lost' })).toContain('status');
    expect(await errorsFor(ListPayoutsQuery, { limit: '500' })).toContain('limit');
  });

  it('requires 64-character lowercase hex hashes when marking an attempt submitted', async () => {
    expect(await errorsFor(MarkAttemptSubmittedDto, { envelopeHash: HASH, transactionHash: HASH })).toEqual([]);
    expect(await errorsFor(MarkAttemptSubmittedDto, { envelopeHash: 'ABC', transactionHash: HASH })).toContain('envelopeHash');
    expect(await errorsFor(MarkAttemptSubmittedDto, {})).toEqual(
      expect.arrayContaining(['envelopeHash', 'transactionHash']),
    );
  });

  it('requires a transaction hash for a succeeded attempt and validates result codes', async () => {
    expect(await errorsFor(ReportAttemptResultDto, { outcome: 'succeeded' })).toContain('transactionHash');
    expect(await errorsFor(ReportAttemptResultDto, { outcome: 'succeeded', transactionHash: HASH })).toEqual([]);
    expect(await errorsFor(ReportAttemptResultDto, { outcome: 'failed', signerError: 'timeout' })).toEqual([]);
    expect(await errorsFor(ReportAttemptResultDto, { outcome: 'maybe' })).toContain('outcome');
    expect(
      await errorsFor(ReportAttemptResultDto, {
        outcome: 'failed',
        resultCodes: { operations: [123] },
      }),
    ).toContain('resultCodes.operations');
  });
});
