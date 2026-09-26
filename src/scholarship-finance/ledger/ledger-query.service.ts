import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { fromMinorUnits } from '../common/money';
import {
  DEBIT_NORMAL_ACCOUNTS,
  LEDGER_ACCOUNTS,
  LedgerAccount,
} from './ledger-accounts';
import { LedgerEntry, LedgerEntryDocument } from './ledger-entry.schema';

export type AccountBalances = Record<LedgerAccount, bigint>;

export interface LedgerSnapshot {
  /** Normal-side balance per account, minor units. */
  balances: AccountBalances;
  entryCount: number;
  /** Id of the latest entry included; lets a reconciliation be re-run on identical inputs. */
  lastEntryId: string | null;
  /** Entries whose lines do not balance (should always be empty). */
  unbalancedEntryIds: string[];
  /** treasury − (program_fund + reserved + awards_payable); must be zero. */
  trialBalanceDifference: bigint;
  totalDisbursed: bigint;
}

/** Converts an aggregated Decimal128 sum of integer amounts to bigint. */
const decimalToBigInt = (value: unknown): bigint =>
  value == null
    ? 0n
    : BigInt((value as Types.Decimal128).toString().split('.')[0]);

/**
 * Derives balances from the immutable journal. Balances are never stored;
 * they are recomputed from entries so that history remains the only source
 * of truth.
 */
@Injectable()
export class LedgerQueryService {
  constructor(
    @InjectModel(LedgerEntry.name)
    private readonly entryModel: Model<LedgerEntryDocument>,
  ) {}

  /**
   * @param asOf    include entries effective at or before this time
   * @param knownAt include only entries recorded at or before this time, so a
   *                past reconciliation can be recomputed exactly even if
   *                back-dated entries were posted afterwards
   */
  async snapshot(
    programId: string,
    asOf?: Date,
    knownAt?: Date,
  ): Promise<LedgerSnapshot> {
    const match: Record<string, unknown> = { programId };
    if (asOf) match.effectiveAt = { $lte: asOf };
    if (knownAt) match.createdAt = { $lte: knownAt };

    const [totals, integrity, meta, disbursed] = await Promise.all([
      this.entryModel
        .aggregate<{
          _id: { account: LedgerAccount; direction: string };
          total: unknown;
        }>([
          { $match: match },
          { $unwind: '$lines' },
          {
            $group: {
              _id: { account: '$lines.account', direction: '$lines.direction' },
              total: { $sum: { $toDecimal: '$lines.amount' } },
            },
          },
        ])
        .exec(),
      this.entryModel
        .aggregate<{ _id: unknown }>([
          { $match: match },
          { $unwind: '$lines' },
          {
            $group: {
              _id: '$_id',
              net: {
                $sum: {
                  $cond: [
                    { $eq: ['$lines.direction', 'debit'] },
                    { $toDecimal: '$lines.amount' },
                    { $multiply: [{ $toDecimal: '$lines.amount' }, -1] },
                  ],
                },
              },
            },
          },
          { $match: { $expr: { $ne: ['$net', { $toDecimal: '0' }] } } },
          { $project: { _id: 1 } },
        ])
        .exec(),
      Promise.all([
        this.entryModel.countDocuments(match).exec(),
        this.entryModel
          .findOne(match, { _id: 1 })
          .sort({ effectiveAt: -1, _id: -1 })
          .lean()
          .exec(),
      ]),
      this.entryModel
        .aggregate<{
          total: unknown;
        }>([
          { $match: { ...match, entryType: 'disbursement' } },
          {
            $group: {
              _id: null,
              total: { $sum: { $toDecimal: '$totalAmount' } },
            },
          },
        ])
        .exec(),
    ]);

    const balances = Object.fromEntries(
      LEDGER_ACCOUNTS.map((a) => [a, 0n]),
    ) as AccountBalances;
    for (const row of totals) {
      const amount = decimalToBigInt(row.total);
      const increases =
        DEBIT_NORMAL_ACCOUNTS.has(row._id.account) ===
        (row._id.direction === 'debit');
      balances[row._id.account] += increases ? amount : -amount;
    }

    return {
      balances,
      entryCount: meta[0],
      lastEntryId: meta[1] ? String(meta[1]._id) : null,
      unbalancedEntryIds: integrity.map((r) => String(r._id)),
      trialBalanceDifference:
        balances.treasury -
        (balances.program_fund + balances.reserved + balances.awards_payable),
      totalDisbursed: decimalToBigInt(disbursed[0]?.total),
    };
  }

  /** Outstanding awards_payable attributable to one award (credits − debits). */
  async awardPayable(programId: string, awardId: string): Promise<bigint> {
    const [row] = await this.entryModel
      .aggregate<{ net: unknown }>([
        { $match: { programId, awardId } },
        { $unwind: '$lines' },
        { $match: { 'lines.account': 'awards_payable' } },
        {
          $group: {
            _id: null,
            net: {
              $sum: {
                $cond: [
                  { $eq: ['$lines.direction', 'credit'] },
                  { $toDecimal: '$lines.amount' },
                  { $multiply: [{ $toDecimal: '$lines.amount' }, -1] },
                ],
              },
            },
          },
        },
      ])
      .exec();
    return decimalToBigInt(row?.net);
  }

  /** API-friendly view of a snapshot with decimal strings. */
  static present(snapshot: LedgerSnapshot) {
    return {
      balances: Object.fromEntries(
        Object.entries(snapshot.balances).map(([k, v]) => [
          k,
          fromMinorUnits(v),
        ]),
      ),
      totalDisbursed: fromMinorUnits(snapshot.totalDisbursed),
      entryCount: snapshot.entryCount,
      lastEntryId: snapshot.lastEntryId,
      trialBalanceDifference: fromMinorUnits(snapshot.trialBalanceDifference),
      unbalancedEntryIds: snapshot.unbalancedEntryIds,
    };
  }
}
