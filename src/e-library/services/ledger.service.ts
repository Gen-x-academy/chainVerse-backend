import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LedgerEntry,
  LedgerEntryDocument,
} from '../schemas/ledger-entry.schema';
import {
  PatronBalance,
  PatronBalanceDocument,
} from '../schemas/patron-balance.schema';
import { LedgerEntryType } from '../enums/ledger-entry-type.enum';
import { ResourceNotFoundException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

export interface PostLedgerEntryInput {
  patronId: string;
  loanId?: string | null;
  entryType: LedgerEntryType;
  amountMinorUnits: number; // signed
  currency: string;
  reason: string;
  referenceEntryId?: string | null;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface StatementQuery {
  currency?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class LedgerService {
  constructor(
    @InjectModel(LedgerEntry.name)
    private readonly ledgerEntryModel: Model<LedgerEntryDocument>,
    @InjectModel(PatronBalance.name)
    private readonly patronBalanceModel: Model<PatronBalanceDocument>,
  ) {}

  // Appends a single immutable entry and atomically updates the cached
  // per-currency balance. The balance update happens first via an atomic
  // $inc (safe under concurrent postings); if the entry insert itself then
  // fails, the increment is rolled back so the cached balance never drifts
  // ahead of what the ledger actually contains.
  async postEntry(input: PostLedgerEntryInput): Promise<LedgerEntryDocument> {
    const balanceBeforeDoc = await this.patronBalanceModel.findOne({
      patronId: input.patronId,
      currency: input.currency,
    });
    const balanceBeforeMinorUnits = balanceBeforeDoc?.balanceMinorUnits ?? 0;

    const updatedBalance = await this.patronBalanceModel.findOneAndUpdate(
      { patronId: input.patronId, currency: input.currency },
      { $inc: { balanceMinorUnits: input.amountMinorUnits, entryCount: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    try {
      return await this.ledgerEntryModel.create({
        patronId: input.patronId,
        loanId: input.loanId ?? null,
        entryType: input.entryType,
        amountMinorUnits: input.amountMinorUnits,
        currency: input.currency,
        balanceBeforeMinorUnits,
        balanceAfterMinorUnits: updatedBalance.balanceMinorUnits,
        reason: input.reason,
        referenceEntryId: input.referenceEntryId ?? null,
        createdBy: input.createdBy,
        metadata: input.metadata ?? {},
      });
    } catch (err) {
      await this.patronBalanceModel.updateOne(
        { patronId: input.patronId, currency: input.currency },
        {
          $inc: { balanceMinorUnits: -input.amountMinorUnits, entryCount: -1 },
        },
      );
      throw err;
    }
  }

  async getBalance(patronId: string, currency: string): Promise<number> {
    const balance = await this.patronBalanceModel.findOne({
      patronId,
      currency,
    });
    return balance?.balanceMinorUnits ?? 0;
  }

  async getEntry(id: string): Promise<LedgerEntryDocument> {
    const entry = await this.ledgerEntryModel.findById(id);
    if (!entry) {
      throw new ResourceNotFoundException(
        `Ledger entry ${id} not found`,
        ErrorCode.RES_LEDGER_ENTRY_NOT_FOUND,
      );
    }
    return entry;
  }

  async getStatement(
    patronId: string,
    query: StatementQuery = {},
  ): Promise<{
    entries: LedgerEntryDocument[];
    page: number;
    limit: number;
    total: number;
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 50;
    const filter = query.currency
      ? { patronId, currency: query.currency }
      : { patronId };

    const [entries, total] = await Promise.all([
      this.ledgerEntryModel
        .find(filter)
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.ledgerEntryModel.countDocuments(filter),
    ]);

    return { entries, page, limit, total };
  }

  // Sum of amounts already posted against a given original charge entry
  // (e.g. how much of it has already been waived or refunded). Compensating
  // entries are stored as negative amounts, so this returns a magnitude.
  async sumEntriesReferencing(referenceEntryId: string): Promise<number> {
    const [result] = await this.ledgerEntryModel.aggregate<{
      _id: null;
      sum: number;
    }>([
      { $match: { referenceEntryId } },
      { $group: { _id: null, sum: { $sum: '$amountMinorUnits' } } },
    ]);
    return Math.abs(result?.sum ?? 0);
  }

  // Recomputes the balance directly from the ledger entry stream and
  // corrects the cached PatronBalance if it has drifted. This is what makes
  // the balance reconcilable from the ledger rather than merely trusted.
  async reconcileBalance(
    patronId: string,
    currency: string,
  ): Promise<{
    previousBalance: number;
    reconciledBalance: number;
    wasDrifted: boolean;
  }> {
    const [aggregate] = await this.ledgerEntryModel.aggregate<{
      _id: null;
      sum: number;
      count: number;
    }>([
      { $match: { patronId, currency } },
      {
        $group: {
          _id: null,
          sum: { $sum: '$amountMinorUnits' },
          count: { $sum: 1 },
        },
      },
    ]);

    const reconciledBalance = aggregate?.sum ?? 0;
    const entryCount = aggregate?.count ?? 0;

    const cached = await this.patronBalanceModel.findOne({
      patronId,
      currency,
    });
    const previousBalance = cached?.balanceMinorUnits ?? 0;
    const wasDrifted = previousBalance !== reconciledBalance;

    await this.patronBalanceModel.updateOne(
      { patronId, currency },
      { $set: { balanceMinorUnits: reconciledBalance, entryCount } },
      { upsert: true },
    );

    return { previousBalance, reconciledBalance, wasDrifted };
  }
}
