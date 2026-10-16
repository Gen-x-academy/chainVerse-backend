import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BusinessRuleException,
  ErrorCode,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors';
import { LedgerSourceType } from '../domain/finance.enums';
import { normalSide } from '../domain/ledger-accounts';
import {
  LedgerBalance,
  LedgerBalanceDocument,
} from '../schemas/ledger-balance.schema';
import {
  LedgerJournal,
  LedgerJournalDocument,
} from '../schemas/ledger-journal.schema';

export interface JournalLineInput {
  account: string;
  debitMinor?: number;
  creditMinor?: number;
}

export interface PostJournalInput {
  organizationId: string;
  assetKey: string;
  idempotencyKey: string;
  sourceType: LedgerSourceType;
  sourceId: string;
  lines: JournalLineInput[];
  memo: string;
  postedBy: string;
  reversalOf?: string | null;
}

export interface BalanceDrift {
  organizationId: string;
  account: string;
  assetKey: string;
  materializedMinor: number;
  journalMinor: number;
}

const DUPLICATE_KEY = 11000;

/**
 * Append-only double-entry ledger.
 *
 * Posting order: guarded balance decrements → balance increments → journal
 * insert. Any failure compensates the balance changes already applied, so an
 * account can never be observed below zero and a rejected posting leaves no
 * trace. MongoDB multi-document transactions are not assumed (standalone
 * deployments); a crash mid-posting is detected by `findDrift()`, which the
 * integrity job runs on a schedule.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    @InjectModel(LedgerJournal.name)
    private readonly journalModel: Model<LedgerJournalDocument>,
    @InjectModel(LedgerBalance.name)
    private readonly balanceModel: Model<LedgerBalanceDocument>,
  ) {}

  async post(input: PostJournalInput): Promise<LedgerJournalDocument> {
    const lines = this.normalizeLines(input.lines);

    const existing = await this.journalModel.findOne({
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      if (existing.organizationId !== input.organizationId) {
        throw new ValidationDomainException(
          'Idempotency key belongs to another tenant',
        );
      }
      return existing;
    }

    const deltas = this.balanceDeltas(lines);
    const applied: { account: string; delta: number }[] = [];

    try {
      // Decrements first so an insufficient balance aborts before anything is credited.
      for (const [account, delta] of [...deltas].sort((a, b) => a[1] - b[1])) {
        if (delta === 0) continue;
        if (delta < 0) {
          const res = await this.balanceModel.updateOne(
            {
              organizationId: input.organizationId,
              account,
              assetKey: input.assetKey,
              balanceMinor: { $gte: -delta },
            },
            { $inc: { balanceMinor: delta } },
          );
          if (res.modifiedCount !== 1) {
            throw new BusinessRuleException(
              `Insufficient balance in ${account} (${input.assetKey}) for this operation`,
              ErrorCode.BIZ_INSUFFICIENT_FUNDS,
            );
          }
        } else {
          await this.balanceModel.updateOne(
            {
              organizationId: input.organizationId,
              account,
              assetKey: input.assetKey,
            },
            { $inc: { balanceMinor: delta } },
            { upsert: true },
          );
        }
        applied.push({ account, delta });
      }

      return await this.journalModel.create({
        organizationId: input.organizationId,
        assetKey: input.assetKey,
        idempotencyKey: input.idempotencyKey,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        lines,
        memo: input.memo,
        postedBy: input.postedBy,
        reversalOf: input.reversalOf ?? null,
      });
    } catch (err) {
      await this.compensate(input, applied);
      if ((err as { code?: number }).code === DUPLICATE_KEY) {
        const raced = await this.journalModel.findOne({
          idempotencyKey: input.idempotencyKey,
        });
        if (raced) return raced;
      }
      throw err;
    }
  }

  /**
   * Posts the mirror image of an existing journal. The original stays
   * untouched except for the `reversedBy` pointer; a journal can be
   * reversed at most once (enforced by the deterministic idempotency key).
   */
  async reverse(
    organizationId: string,
    journalId: string,
    meta: {
      sourceType: LedgerSourceType;
      sourceId: string;
      memo: string;
      postedBy: string;
    },
  ): Promise<LedgerJournalDocument> {
    const original = await this.journalModel.findOne({
      _id: journalId,
      organizationId,
    });
    if (!original) throw new ResourceNotFoundException('Journal not found');
    if (original.reversalOf) {
      throw new BusinessRuleException(
        'A reversal journal cannot itself be reversed',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }

    const reversal = await this.post({
      organizationId,
      assetKey: original.assetKey,
      idempotencyKey: `reversal:${journalId}`,
      sourceType: meta.sourceType,
      sourceId: meta.sourceId,
      memo: meta.memo,
      postedBy: meta.postedBy,
      reversalOf: journalId,
      lines: original.lines.map((l) => ({
        account: l.account,
        debitMinor: l.creditMinor,
        creditMinor: l.debitMinor,
      })),
    });

    await this.journalModel.updateOne(
      { _id: journalId, reversedBy: null },
      { $set: { reversedBy: reversal.id } },
    );
    return reversal;
  }

  async getBalance(
    organizationId: string,
    account: string,
    assetKey: string,
  ): Promise<number> {
    const doc = await this.balanceModel
      .findOne({ organizationId, account, assetKey })
      .lean();
    return doc?.balanceMinor ?? 0;
  }

  listBalances(organizationId: string, assetKey?: string) {
    const filter: Record<string, unknown> = { organizationId };
    if (assetKey) filter.assetKey = assetKey;
    return this.balanceModel
      .find(filter)
      .select('account assetKey balanceMinor updatedAt -_id')
      .sort({ assetKey: 1, account: 1 })
      .lean();
  }

  listJournals(
    organizationId: string,
    filter: { sourceType?: string; sourceId?: string; assetKey?: string },
    limit = 50,
    skip = 0,
  ) {
    const query: Record<string, unknown> = { organizationId };
    if (filter.sourceType) query.sourceType = filter.sourceType;
    if (filter.sourceId) query.sourceId = filter.sourceId;
    if (filter.assetKey) query.assetKey = filter.assetKey;
    return this.journalModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  /**
   * Recomputes every balance from the journal and returns accounts whose
   * materialized balance disagrees. Scoped to one tenant when given.
   */
  async findDrift(organizationId?: string): Promise<BalanceDrift[]> {
    const match = organizationId ? { organizationId } : {};
    const totals = await this.journalModel.aggregate<{
      _id: { organizationId: string; account: string; assetKey: string };
      debit: number;
      credit: number;
    }>([
      { $match: match },
      { $unwind: '$lines' },
      {
        $group: {
          _id: {
            organizationId: '$organizationId',
            account: '$lines.account',
            assetKey: '$assetKey',
          },
          debit: { $sum: '$lines.debitMinor' },
          credit: { $sum: '$lines.creditMinor' },
        },
      },
    ]);

    const expected = new Map<string, BalanceDrift>();
    for (const t of totals) {
      const { organizationId: org, account, assetKey } = t._id;
      const journalMinor =
        normalSide(account) === 'debit'
          ? t.debit - t.credit
          : t.credit - t.debit;
      expected.set(`${org}|${account}|${assetKey}`, {
        organizationId: org,
        account,
        assetKey,
        journalMinor,
        materializedMinor: 0,
      });
    }

    const drift: BalanceDrift[] = [];
    const balances = await this.balanceModel.find(match).lean();
    for (const b of balances) {
      const key = `${b.organizationId}|${b.account}|${b.assetKey}`;
      const row = expected.get(key) ?? {
        organizationId: b.organizationId,
        account: b.account,
        assetKey: b.assetKey,
        journalMinor: 0,
        materializedMinor: 0,
      };
      row.materializedMinor = b.balanceMinor;
      expected.set(key, row);
    }
    for (const row of expected.values()) {
      if (row.journalMinor !== row.materializedMinor) drift.push(row);
    }
    return drift;
  }

  private normalizeLines(lines: JournalLineInput[]) {
    if (lines.length < 2) {
      throw new ValidationDomainException('A journal needs at least two lines');
    }
    let debits = 0;
    let credits = 0;
    const normalized = lines.map((l) => {
      const debitMinor = l.debitMinor ?? 0;
      const creditMinor = l.creditMinor ?? 0;
      if (
        !Number.isSafeInteger(debitMinor) ||
        !Number.isSafeInteger(creditMinor) ||
        debitMinor < 0 ||
        creditMinor < 0 ||
        debitMinor > 0 === creditMinor > 0
      ) {
        throw new ValidationDomainException(
          `Journal line for ${l.account} must have exactly one positive integer side`,
        );
      }
      debits += debitMinor;
      credits += creditMinor;
      return { account: l.account, debitMinor, creditMinor };
    });
    if (debits !== credits || !Number.isSafeInteger(debits)) {
      throw new ValidationDomainException('Journal is not balanced');
    }
    return normalized;
  }

  private balanceDeltas(
    lines: { account: string; debitMinor: number; creditMinor: number }[],
  ) {
    const deltas = new Map<string, number>();
    for (const l of lines) {
      const signed =
        normalSide(l.account) === 'debit'
          ? l.debitMinor - l.creditMinor
          : l.creditMinor - l.debitMinor;
      deltas.set(l.account, (deltas.get(l.account) ?? 0) + signed);
    }
    return deltas;
  }

  private async compensate(
    input: PostJournalInput,
    applied: { account: string; delta: number }[],
  ) {
    for (const { account, delta } of applied.reverse()) {
      try {
        await this.balanceModel.updateOne(
          {
            organizationId: input.organizationId,
            account,
            assetKey: input.assetKey,
          },
          { $inc: { balanceMinor: -delta } },
        );
      } catch (err) {
        // Leaves drift that the integrity job will surface; never swallow silently.
        this.logger.error(
          `Failed to compensate ${account} (${input.assetKey}) by ${-delta} for ${input.idempotencyKey}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
