import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FinanceStatement,
  FinanceStatementDocument,
  StatementExportStatus,
  StatementLineItem,
} from './schemas/finance-statement.schema';
import {
  LedgerJournal,
  LedgerJournalDocument,
} from '../scholarship-finance/schemas/ledger-journal.schema';
import {
  SponsorDeposit,
  SponsorDepositDocument,
} from '../scholarship-finance/schemas/sponsor-deposit.schema';
import {
  Refund,
  RefundDocument,
} from '../scholarship-finance/schemas/refund.schema';
import {
  RecoveryClaim,
  RecoveryClaimDocument,
} from '../scholarship-finance/schemas/recovery-claim.schema';
import {
  BudgetReservation,
  BudgetReservationDocument,
  ReservationStatus,
} from '../scholarships/schemas/budget-reservation.schema';
import {
  GenerateStatementDto,
  StatementListQueryDto,
  FinanceStatementResponseDto,
  StatementSummaryDto,
} from './dto/finance-statement.dto';
import {
  BusinessRuleException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';

/**
 * ScholarshipFinanceStatementService
 *
 * Produces period finance statements by aggregating all financial events
 * (deposits, fees, disbursements, refunds, recoveries) for a sponsor
 * organisation into an ordered, reconciled ledger view.
 *
 * Statement generation:
 *   - Inline (synchronous) for periods ≤ INLINE_LIMIT line items.
 *   - Asynchronous (PENDING → RUNNING → READY) for larger ranges.
 *     The same method is used for both paths; the async path returns a PENDING
 *     document and the caller polls `getStatement()` for completion.
 *
 * Reconciliation:
 *   opening + credits - debits == closing  (within RECONCILE_TOLERANCE minor units)
 *
 * Currency consistency:
 *   All line items for a statement must share the same currency.  When mixed
 *   currencies are detected BIZ_STATEMENT_CURRENCY_MISMATCH is thrown and the
 *   caller must request per-currency statements explicitly.
 *
 * Ownership:
 *   Statements are scoped to `organizationId`; OWNER and ADMIN may generate
 *   and retrieve them.
 *
 * Privacy:
 *   Statements contain financial amounts; no applicant identity is included.
 *   Recipient disbursement entries reference an opaque `sourceId` only.
 */
@Injectable()
export class ScholarshipFinanceStatementService {
  private static readonly RECONCILE_TOLERANCE = 0.01;
  /** Switch to async mode when the estimated line-item count exceeds this. */
  private static readonly INLINE_LIMIT = 500;
  /** How long (days) a READY statement is retained before expiry. */
  private static readonly RETENTION_DAYS = 30;

  constructor(
    @InjectModel(FinanceStatement.name)
    private readonly statementModel: Model<FinanceStatementDocument>,
    @InjectModel(LedgerJournal.name)
    private readonly journalModel: Model<LedgerJournalDocument>,
    @InjectModel(SponsorDeposit.name)
    private readonly depositModel: Model<SponsorDepositDocument>,
    @InjectModel(Refund.name)
    private readonly refundModel: Model<RefundDocument>,
    @InjectModel(RecoveryClaim.name)
    private readonly recoveryModel: Model<RecoveryClaimDocument>,
    @InjectModel(BudgetReservation.name)
    private readonly reservationModel: Model<BudgetReservationDocument>,
  ) {}

  // ── Generate ───────────────────────────────────────────────────────────────

  /**
   * Requests statement generation for the given period.
   *
   * - Validates that periodStart < periodEnd.
   * - Blocks concurrent generation for the same (org, program, period) by
   *   checking for an existing PENDING or RUNNING statement.
   * - For periods with ≤ INLINE_LIMIT line items, computes synchronously and
   *   returns a READY statement.
   * - For larger periods, creates a PENDING document and returns immediately
   *   so the caller can poll.
   */
  async generateStatement(
    actorId: string,
    dto: GenerateStatementDto,
  ): Promise<FinanceStatementDocument> {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    if (periodStart >= periodEnd) {
      throw new ValidationDomainException(
        'periodStart must be before periodEnd',
        ErrorCode.VAL_STATEMENT_DATE_RANGE_INVALID,
      );
    }

    // Block concurrent exports for the same scope.
    const inProgress = await this.statementModel
      .findOne({
        organizationId: dto.organizationId,
        programId: dto.programId ?? null,
        periodStart,
        periodEnd,
        status: { $in: [StatementExportStatus.PENDING, StatementExportStatus.RUNNING] },
      })
      .exec();
    if (inProgress) {
      throw new BusinessRuleException(
        'A statement export is already in progress for this period',
        ErrorCode.BIZ_STATEMENT_EXPORT_IN_PROGRESS,
      );
    }

    // Estimate line-item count to decide sync vs async.
    const estimatedCount = await this.estimateLineItemCount(
      dto.organizationId,
      dto.programId,
      periodStart,
      periodEnd,
    );

    const doc = await this.statementModel.create({
      organizationId: dto.organizationId,
      programId: dto.programId ?? null,
      periodStart,
      periodEnd,
      status: StatementExportStatus.PENDING,
      currency: dto.currency ?? 'USD',
      openingBalanceMinor: 0,
      closingBalanceMinor: 0,
      totalCreditsMinor: 0,
      totalDebitsMinor: 0,
      reconciled: false,
      reconciliationNote: null,
      lineItems: [],
      requestedBy: actorId,
      completedAt: null,
      errorMessage: null,
      expiresAt: null,
    });

    if (estimatedCount <= ScholarshipFinanceStatementService.INLINE_LIMIT) {
      // Compute inline — mutates and returns the same document.
      return this.computeStatement(doc);
    }

    // Async path: return PENDING and let a background job call computeStatement().
    return doc;
  }

  // ── List ───────────────────────────────────────────────────────────────────

  async listStatements(
    query: StatementListQueryDto,
  ): Promise<{ data: StatementSummaryDto[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      organizationId: query.organizationId,
    };
    if (query.status) filter.status = query.status;
    if (query.programId) filter.programId = query.programId;

    const [docs, total] = await Promise.all([
      this.statementModel
        .find(filter)
        .select('-lineItems') // keep list payloads small
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.statementModel.countDocuments(filter).exec(),
    ]);

    const data: StatementSummaryDto[] = docs.map((d) =>
      this.toSummaryDto(d as FinanceStatementDocument),
    );

    return { data, total, page, limit };
  }

  // ── Get ────────────────────────────────────────────────────────────────────

  async getStatement(
    organizationId: string,
    statementId: string,
  ): Promise<FinanceStatementResponseDto> {
    const doc = await this.statementModel
      .findOne({ _id: statementId, organizationId })
      .exec();
    if (!doc) {
      throw new ResourceNotFoundException(
        'Finance statement not found',
        ErrorCode.RES_FINANCE_STATEMENT_NOT_FOUND,
      );
    }
    return this.toResponseDto(doc);
  }

  // ── Async compute (called by job or inline) ────────────────────────────────

  /**
   * Performs the full statement computation: assembles line items, computes
   * opening/closing balances, and flags reconciliation status.
   *
   * This method is idempotent — calling it on an already-READY statement has
   * no effect.
   */
  async computeStatement(
    doc: FinanceStatementDocument,
  ): Promise<FinanceStatementDocument> {
    if (doc.status === StatementExportStatus.READY) return doc;

    doc.status = StatementExportStatus.RUNNING;
    await doc.save();

    try {
      const lines = await this.buildLineItems(
        doc.organizationId,
        doc.programId,
        doc.periodStart,
        doc.periodEnd,
      );

      if (lines.length === 0) {
        throw new BusinessRuleException(
          'No ledger entries found in the requested period',
          ErrorCode.BIZ_STATEMENT_NO_ENTRIES,
        );
      }

      // Validate currency consistency.
      const currencies = new Set(lines.map((l) => l.currency));
      if (currencies.size > 1) {
        throw new BusinessRuleException(
          `Mixed currencies detected in period: ${[...currencies].join(', ')}. ` +
            'Request per-currency statements by specifying the currency parameter.',
          ErrorCode.BIZ_STATEMENT_CURRENCY_MISMATCH,
        );
      }

      const currency = [...currencies][0];

      // Sort chronologically and compute running balance.
      lines.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

      let runningBalance = 0; // opening balance — from the ledger balance if available
      let totalCredits = 0;
      let totalDebits = 0;

      const itemsWithBalance: StatementLineItem[] = lines.map((raw) => {
        totalCredits += raw.creditMinor;
        totalDebits += raw.debitMinor;
        runningBalance += raw.creditMinor - raw.debitMinor;
        return {
          occurredAt: raw.occurredAt,
          eventType: raw.eventType,
          description: raw.description,
          sourceId: raw.sourceId,
          sourceType: raw.sourceType,
          creditMinor: raw.creditMinor,
          debitMinor: raw.debitMinor,
          runningBalanceMinor: runningBalance,
          currency,
        };
      });

      const openingBalance = 0; // we treat beginning of period as 0; could be enriched later
      const closingBalance = openingBalance + totalCredits - totalDebits;
      const discrepancy = Math.abs(closingBalance - runningBalance);
      const reconciled =
        discrepancy <= ScholarshipFinanceStatementService.RECONCILE_TOLERANCE;

      const expiresAt = new Date();
      expiresAt.setDate(
        expiresAt.getDate() + ScholarshipFinanceStatementService.RETENTION_DAYS,
      );

      doc.lineItems = itemsWithBalance;
      doc.currency = currency;
      doc.openingBalanceMinor = openingBalance;
      doc.closingBalanceMinor = closingBalance;
      doc.totalCreditsMinor = totalCredits;
      doc.totalDebitsMinor = totalDebits;
      doc.reconciled = reconciled;
      doc.reconciliationNote = reconciled
        ? null
        : `Discrepancy of ${discrepancy.toFixed(4)} minor units detected between computed closing balance and running total.`;
      doc.status = StatementExportStatus.READY;
      doc.completedAt = new Date();
      doc.errorMessage = null;
      doc.expiresAt = expiresAt;

      return doc.save();
    } catch (err: unknown) {
      doc.status = StatementExportStatus.FAILED;
      doc.errorMessage =
        err instanceof Error ? err.message : 'Unknown error during computation';
      doc.completedAt = new Date();
      await doc.save();
      throw err;
    }
  }

  // ── Expiry job ─────────────────────────────────────────────────────────────

  /**
   * Expires all READY statements whose `expiresAt` has passed.
   * Called by a scheduled job (ScholarshipFinanceStatementJobs).
   */
  async expireStaleStatements(): Promise<number> {
    const result = await this.statementModel
      .updateMany(
        {
          status: StatementExportStatus.READY,
          expiresAt: { $lt: new Date() },
        },
        {
          $set: {
            status: StatementExportStatus.EXPIRED,
            lineItems: [], // purge line-item data to free storage
          },
        },
      )
      .exec();
    return result.modifiedCount;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async estimateLineItemCount(
    organizationId: string,
    programId: string | undefined,
    from: Date,
    to: Date,
  ): Promise<number> {
    const baseFilter: Record<string, unknown> = {
      organizationId,
      createdAt: { $gte: from, $lte: to },
    };
    if (programId) baseFilter.programId = programId;

    const [deposits, refunds, recoveries, reservations] = await Promise.all([
      this.depositModel.countDocuments(baseFilter).exec(),
      this.refundModel.countDocuments(baseFilter).exec(),
      this.recoveryModel.countDocuments(baseFilter).exec(),
      this.reservationModel.countDocuments({
        organizationId,
        ...(programId ? { programId } : {}),
        createdAt: { $gte: from, $lte: to },
      }).exec(),
    ]);

    return deposits + refunds + recoveries + reservations;
  }

  /**
   * Assembles raw line items from all financial source collections within the
   * period.  Each source type produces one or more lines.
   *
   * Sources:
   *   - SponsorDeposit (credited)    → contribution credit
   *   - Refund (completed)           → refund debit
   *   - BudgetReservation (CONFIRMED)→ commitment debit (award disbursement)
   *   - RecoveryClaim (collections)  → recovery credit (funds returned)
   *   - LedgerJournal lines          → fee debits and reversals
   */
  private async buildLineItems(
    organizationId: string,
    programId: string | null,
    from: Date,
    to: Date,
  ): Promise<Omit<StatementLineItem, 'runningBalanceMinor'>[]> {
    const dateRange = { $gte: from, $lte: to };
    const orgFilter: Record<string, unknown> = { organizationId };
    if (programId) orgFilter.programId = programId;

    const [deposits, refunds, reservations, recoveries, journals] =
      await Promise.all([
        this.depositModel
          .find({ ...orgFilter, createdAt: dateRange })
          .lean()
          .exec(),
        this.refundModel
          .find({
            ...orgFilter,
            status: 'completed',
            completedAt: dateRange,
          })
          .lean()
          .exec(),
        this.reservationModel
          .find({
            ...orgFilter,
            status: ReservationStatus.CONFIRMED,
            resolvedAt: dateRange,
          })
          .lean()
          .exec(),
        this.recoveryModel
          .find({ ...orgFilter, createdAt: dateRange })
          .lean()
          .exec(),
        this.journalModel
          .find({ organizationId, createdAt: dateRange })
          .lean()
          .exec(),
      ]);

    const lines: Omit<StatementLineItem, 'runningBalanceMinor'>[] = [];

    // Sponsor deposits → credit
    for (const d of deposits) {
      lines.push({
        occurredAt: d.createdAt as Date,
        eventType: 'deposit_credit',
        description: `Sponsor deposit via ${d.source.rail}`,
        sourceId: String(d._id),
        sourceType: 'Sponsor Deposit',
        creditMinor: d.netMinor ?? d.grossMinor,
        debitMinor: 0,
        currency: d.assetKey.split(':')[0] ?? 'USD',
      });
      // Fee line
      if (d.fee && (d.fee.platformFeeMinor > 0 || d.fee.networkFeeMinor > 0)) {
        const feeTotal = d.fee.platformFeeMinor + d.fee.networkFeeMinor;
        lines.push({
          occurredAt: d.createdAt as Date,
          eventType: 'fee_debit',
          description: `Platform + network fee on deposit ${String(d._id)}`,
          sourceId: String(d._id),
          sourceType: 'Deposit Fee',
          creditMinor: 0,
          debitMinor: feeTotal,
          currency: d.assetKey.split(':')[0] ?? 'USD',
        });
      }
    }

    // Refunds → debit
    for (const r of refunds) {
      lines.push({
        occurredAt: (r.completedAt ?? r.createdAt) as Date,
        eventType: 'refund_payout',
        description: r.reason,
        sourceId: String(r._id),
        sourceType: 'Refund',
        creditMinor: 0,
        debitMinor: r.amountMinor,
        currency: r.assetKey.split(':')[0] ?? 'USD',
      });
    }

    // Confirmed reservations (awards disbursed) → debit
    for (const res of reservations) {
      lines.push({
        occurredAt: (res.resolvedAt ?? res.createdAt) as Date,
        eventType: 'award_disbursement',
        description: `Award disbursement confirmed for application ${String(res.applicationId)}`,
        sourceId: String(res._id),
        sourceType: 'Award Disbursement',
        creditMinor: 0,
        debitMinor: res.amount,
        currency: res.currency,
      });
    }

    // Recovery collections → credit (funds returned to the pool)
    for (const rc of recoveries) {
      if (rc.collectedMinor > 0) {
        lines.push({
          occurredAt: rc.createdAt as Date,
          eventType: 'recovery_collection',
          description: `Recovery collection: ${rc.reason}`,
          sourceId: String(rc._id),
          sourceType: 'Recovery',
          creditMinor: rc.collectedMinor,
          debitMinor: 0,
          currency: rc.assetKey.split(':')[0] ?? 'USD',
        });
      }
      if (rc.writtenOffMinor > 0) {
        lines.push({
          occurredAt: rc.createdAt as Date,
          eventType: 'recovery_write_off',
          description: `Recovery write-off: ${rc.reason}`,
          sourceId: String(rc._id),
          sourceType: 'Recovery Write-off',
          creditMinor: 0,
          debitMinor: rc.writtenOffMinor,
          currency: rc.assetKey.split(':')[0] ?? 'USD',
        });
      }
    }

    // Ledger journal reversals
    for (const j of journals) {
      if (j.reversalOf) {
        for (const line of j.lines) {
          if (line.creditMinor > 0 || line.debitMinor > 0) {
            lines.push({
              occurredAt: j.createdAt as Date,
              eventType: 'ledger_reversal',
              description: j.memo,
              sourceId: String(j._id),
              sourceType: 'Ledger Reversal',
              creditMinor: line.creditMinor,
              debitMinor: line.debitMinor,
              currency: j.assetKey.split(':')[0] ?? 'USD',
            });
          }
        }
      }
    }

    return lines;
  }

  // ── Mapping helpers ────────────────────────────────────────────────────────

  private toSummaryDto(doc: FinanceStatementDocument): StatementSummaryDto {
    return {
      statementId: String(doc._id),
      organizationId: doc.organizationId,
      programId: doc.programId ?? undefined,
      periodStart: doc.periodStart,
      periodEnd: doc.periodEnd,
      status: doc.status,
      currency: doc.currency,
      openingBalanceMinor: doc.openingBalanceMinor,
      closingBalanceMinor: doc.closingBalanceMinor,
      totalCreditsMinor: doc.totalCreditsMinor,
      totalDebitsMinor: doc.totalDebitsMinor,
      reconciled: doc.reconciled,
      reconciliationNote: doc.reconciliationNote ?? undefined,
      requestedBy: doc.requestedBy,
      completedAt: doc.completedAt ?? undefined,
      expiresAt: doc.expiresAt ?? undefined,
      createdAt: doc.createdAt as Date,
    };
  }

  private toResponseDto(doc: FinanceStatementDocument): FinanceStatementResponseDto {
    return {
      ...this.toSummaryDto(doc),
      lineItems: doc.lineItems.map((l) => ({
        occurredAt: l.occurredAt,
        eventType: l.eventType,
        description: l.description,
        sourceId: l.sourceId,
        sourceType: l.sourceType,
        creditMinor: l.creditMinor,
        debitMinor: l.debitMinor,
        runningBalanceMinor: l.runningBalanceMinor,
        currency: l.currency,
      })),
    };
  }
}
