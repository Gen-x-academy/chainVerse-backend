import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { isValidObjectId, Model } from 'mongoose';
import {
  BusinessRuleException,
  ErrorCode,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors';
import { ScholarshipFinanceEvents } from '../scholarship-finance.events';
import { fromMinorUnits, sum, toMinorUnits } from '../common/money';
import { ScholarshipProgramDocument } from '../programs/scholarship-program.schema';
import { ScholarshipProgramService } from '../programs/scholarship-program.service';
import { SolvencyGuardService } from '../reconciliation/solvency-guard.service';
import {
  ListLedgerEntriesQuery,
  PostLedgerEntryDto,
  ReverseLedgerEntryDto,
} from './dto/ledger.dto';
import {
  DEBIT_NORMAL_ACCOUNTS,
  ENTRY_TEMPLATES,
  LEDGER_ACCOUNTS,
  LedgerEntryType,
  OBLIGATION_ENTRY_TYPES,
} from './ledger-accounts';
import {
  LedgerEntry,
  LedgerEntryDocument,
  LedgerLine,
} from './ledger-entry.schema';
import { AccountBalances, LedgerQueryService } from './ledger-query.service';

/** Entry types that may still be posted against a closed program (wind-down). */
const CLOSED_PROGRAM_ALLOWED: ReadonlySet<LedgerEntryType> = new Set([
  'reservation_release',
  'award_cancellation',
  'disbursement',
  'refund',
  'recovery',
  'adjustment',
  'reversal',
]);

export interface PostEntryCommand extends PostLedgerEntryDto {
  payoutIntentId?: string;
}

export interface PostEntryResult {
  entry: ReturnType<typeof presentLedgerEntry>;
  /** True when an identical request with the same reference was already posted. */
  replayed: boolean;
}

export function presentLedgerEntry(entry: LedgerEntry & { _id?: unknown }) {
  return {
    id: String(entry._id),
    organizationId: entry.organizationId,
    programId: entry.programId,
    reference: entry.reference,
    entryType: entry.entryType,
    lines: entry.lines.map((l) => ({
      account: l.account,
      direction: l.direction,
      amount: fromMinorUnits(BigInt(l.amount)),
    })),
    totalAmount: fromMinorUnits(BigInt(entry.totalAmount)),
    assetCode: entry.assetCode,
    description: entry.description,
    reason: entry.reason,
    awardId: entry.awardId,
    installmentId: entry.installmentId,
    payoutIntentId: entry.payoutIntentId,
    transactionHash: entry.transactionHash,
    reversalOf: entry.reversalOf,
    effectiveAt: entry.effectiveAt,
    postedBy: entry.postedBy,
    createdAt: entry.createdAt,
  };
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    @InjectModel(LedgerEntry.name)
    private readonly entryModel: Model<LedgerEntryDocument>,
    private readonly programs: ScholarshipProgramService,
    private readonly query: LedgerQueryService,
    private readonly solvency: SolvencyGuardService,
    private readonly events: EventEmitter2,
  ) {}

  async post(
    program: ScholarshipProgramDocument,
    cmd: PostEntryCommand,
    postedBy: string,
  ): Promise<PostEntryResult> {
    this.assertProgramAccepts(program, cmd.entryType);

    const lines = this.buildLines(cmd);
    const total = this.assertBalanced(lines);
    const requestHash = this.hash({ ...cmd, lines, effectiveAt: undefined });

    return this.write(program, requestHash, {
      organizationId: program.organizationId,
      programId: String(program._id),
      reference: cmd.reference,
      entryType: cmd.entryType,
      lines,
      totalAmount: total.toString(),
      assetCode: program.asset.code,
      description:
        cmd.description ??
        (cmd.entryType === 'adjustment'
          ? 'Manual adjustment'
          : ENTRY_TEMPLATES[cmd.entryType].description),
      reason: cmd.reason,
      awardId: cmd.awardId,
      installmentId: cmd.installmentId,
      payoutIntentId: cmd.payoutIntentId,
      transactionHash: cmd.transactionHash,
      effectiveAt: cmd.effectiveAt ?? new Date(),
      postedBy,
      requestHash,
    });
  }

  async reverse(
    program: ScholarshipProgramDocument,
    entryId: string,
    dto: ReverseLedgerEntryDto,
    postedBy: string,
  ): Promise<PostEntryResult> {
    const original = await this.findOne(program, entryId);
    if (original.entryType === 'reversal') {
      throw new BusinessRuleException(
        'A reversal cannot itself be reversed; post a new entry instead',
        ErrorCode.BIZ_LEDGER_ENTRY_ALREADY_REVERSED,
      );
    }
    const existingReversal = await this.entryModel
      .findOne({ reversalOf: String(original._id) })
      .lean()
      .exec();
    if (existingReversal && existingReversal.reference !== dto.reference) {
      throw new ResourceConflictException(
        'This entry has already been reversed',
        ErrorCode.BIZ_LEDGER_ENTRY_ALREADY_REVERSED,
      );
    }

    const lines: LedgerLine[] = original.lines.map((l) => ({
      account: l.account,
      direction: l.direction === 'debit' ? 'credit' : 'debit',
      amount: l.amount,
    }));
    const requestHash = this.hash({ reverse: String(original._id), ...dto });

    return this.write(program, requestHash, {
      organizationId: program.organizationId,
      programId: String(program._id),
      reference: dto.reference,
      entryType: 'reversal',
      lines,
      totalAmount: original.totalAmount,
      assetCode: original.assetCode,
      description: `Reversal of ${original.reference}`,
      reason: dto.reason,
      awardId: original.awardId,
      installmentId: original.installmentId,
      payoutIntentId: original.payoutIntentId,
      reversalOf: String(original._id),
      effectiveAt: new Date(),
      postedBy,
      requestHash,
    });
  }

  async list(program: ScholarshipProgramDocument, q: ListLedgerEntriesQuery) {
    const filter: Record<string, unknown> = { programId: String(program._id) };
    if (q.entryType) filter.entryType = q.entryType;
    if (q.awardId) filter.awardId = q.awardId;
    if (q.before) filter._id = { $lt: q.before };
    const entries = await this.entryModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(q.limit ?? 50)
      .lean()
      .exec();
    return {
      data: entries.map(presentLedgerEntry),
      nextCursor:
        entries.length === (q.limit ?? 50) ? String(entries.at(-1)!._id) : null,
    };
  }

  async findOne(program: ScholarshipProgramDocument, entryId: string) {
    const entry = isValidObjectId(entryId)
      ? await this.entryModel
          .findOne({ _id: entryId, programId: String(program._id) })
          .lean()
          .exec()
      : null;
    if (!entry) {
      throw new ResourceNotFoundException(
        'Ledger entry not found',
        ErrorCode.RES_LEDGER_ENTRY_NOT_FOUND,
      );
    }
    return entry;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async write(
    program: ScholarshipProgramDocument,
    requestHash: string,
    doc: LedgerEntry,
  ): Promise<PostEntryResult> {
    const programId = String(program._id);

    return this.programs.withLedgerLock(programId, async () => {
      const replay = await this.findByReference(
        program.organizationId,
        doc.reference,
        requestHash,
      );
      if (replay) return replay;

      const snapshot = await this.query.snapshot(programId);
      const amount = BigInt(doc.totalAmount);

      if (OBLIGATION_ENTRY_TYPES.has(doc.entryType)) {
        // A reservation adds to total obligations; an award only moves reserved → payable.
        const newObligations = doc.entryType === 'reservation' ? amount : 0n;
        await this.solvency.assertCanTakeObligation(
          program,
          newObligations,
          snapshot,
        );
      }
      this.assertNoNegativeBalances(snapshot.balances, doc.lines);

      let created: LedgerEntryDocument;
      try {
        created = await this.entryModel.create(doc);
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) {
          const raced = await this.findByReference(
            program.organizationId,
            doc.reference,
            requestHash,
          );
          if (raced) return raced;
          throw new ResourceConflictException(
            'This entry has already been reversed',
            ErrorCode.BIZ_LEDGER_ENTRY_ALREADY_REVERSED,
          );
        }
        throw err;
      }

      this.logger.log(
        `Ledger entry ${created.id} (${doc.entryType}, ${fromMinorUnits(amount)} ${doc.assetCode}) posted to program ${programId}`,
      );
      this.events.emit(ScholarshipFinanceEvents.LEDGER_ENTRY_POSTED, {
        organizationId: doc.organizationId,
        programId,
        entryId: created.id,
        entryType: doc.entryType,
        amount: fromMinorUnits(amount),
      });
      return { entry: presentLedgerEntry(created.toObject()), replayed: false };
    });
  }

  /**
   * Returns the existing entry for an identical replay, throws on a reference
   * reused with a different payload, or returns null when the reference is free.
   */
  private async findByReference(
    organizationId: string,
    reference: string,
    requestHash: string,
  ): Promise<PostEntryResult | null> {
    const existing = await this.entryModel
      .findOne({ organizationId, reference })
      .select('+requestHash')
      .lean()
      .exec();
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw new ResourceConflictException(
        `Reference "${reference}" is already used by a different ledger entry`,
        ErrorCode.BIZ_LEDGER_REFERENCE_CONFLICT,
      );
    }
    return { entry: presentLedgerEntry(existing), replayed: true };
  }

  private assertProgramAccepts(
    program: ScholarshipProgramDocument,
    type: LedgerEntryType,
  ) {
    if (program.status === 'active') return;
    if (program.status === 'suspended' && !OBLIGATION_ENTRY_TYPES.has(type))
      return;
    if (program.status === 'closed' && CLOSED_PROGRAM_ALLOWED.has(type)) return;
    throw new BusinessRuleException(
      `A ${program.status} program does not accept ${type} entries`,
      ErrorCode.BIZ_RECONCILIATION_BLOCKED,
    );
  }

  private buildLines(cmd: PostLedgerEntryDto): LedgerLine[] {
    if (cmd.entryType === 'adjustment') {
      return (cmd.lines ?? []).map((l) => ({
        account: l.account,
        direction: l.direction,
        amount: toMinorUnits(l.amount).toString(),
      }));
    }
    const template = ENTRY_TEMPLATES[cmd.entryType];
    const amount = toMinorUnits(cmd.amount!).toString();
    return [
      { account: template.debit, direction: 'debit', amount },
      { account: template.credit, direction: 'credit', amount },
    ];
  }

  private assertBalanced(lines: LedgerLine[]): bigint {
    const debits = sum(
      lines.filter((l) => l.direction === 'debit').map((l) => BigInt(l.amount)),
    );
    const credits = sum(
      lines
        .filter((l) => l.direction === 'credit')
        .map((l) => BigInt(l.amount)),
    );
    if (
      debits <= 0n ||
      debits !== credits ||
      lines.some((l) => BigInt(l.amount) <= 0n)
    ) {
      throw new BusinessRuleException(
        `Entry does not balance: debits ${fromMinorUnits(debits)} ≠ credits ${fromMinorUnits(credits)}`,
        ErrorCode.BIZ_LEDGER_UNBALANCED,
      );
    }
    return debits;
  }

  /** No account may be driven below zero on its normal side. */
  private assertNoNegativeBalances(
    current: AccountBalances,
    lines: LedgerLine[],
  ) {
    const projected = { ...current };
    for (const line of lines) {
      const increases =
        DEBIT_NORMAL_ACCOUNTS.has(line.account) ===
        (line.direction === 'debit');
      projected[line.account] += increases
        ? BigInt(line.amount)
        : -BigInt(line.amount);
    }
    const negative = LEDGER_ACCOUNTS.filter((a) => projected[a] < 0n);
    if (negative.length) {
      throw new BusinessRuleException(
        `Insufficient balance: entry would make ${negative
          .map((a) => `${a} ${fromMinorUnits(projected[a])}`)
          .join(', ')}`,
        ErrorCode.BIZ_PROGRAM_INSOLVENT,
      );
    }
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
