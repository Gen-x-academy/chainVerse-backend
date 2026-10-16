import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { BusinessRuleException } from '../../common/errors/domain.exception';
import { DomainEvents } from '../../events/event-names';
import { OutboxService } from '../../scholarship-outbox/services/outbox.service';
import {
  ScholarshipTransactionRunner,
  withSession,
} from '../../scholarship-outbox/services/scholarship-transaction.runner';
import { OutboxAggregateType } from '../../scholarship-outbox/schemas/outbox-event.schema';
import {
  BudgetLedger,
  BudgetLedgerDocument,
  BudgetReservation,
  BudgetReservationDocument,
  ReservationStatus,
} from '../schemas/budget-reservation.schema';

/** Programs examined per pass. */
const LEDGER_SCAN_LIMIT = 200;

export interface LedgerDrift {
  ledgerId: string;
  organizationId: string;
  programId: string;
  reservedAmount: number;
  expectedReservedAmount: number;
  disbursedAmount: number;
  expectedDisbursedAmount: number;
}

/**
 * Second line of defence for the budget invariant.
 *
 * The transactional write path in `BudgetReservationService` makes
 * divergence impossible on a replica set, so this job is not part of the normal
 * happy path. It exists because "impossible" is a claim about one deployment
 * configuration, and there are three ways it stops being true:
 *
 *   1. **Degraded mode.** `ScholarshipTransactionRunner` falls back to
 *      non-transactional writes on a standalone mongod. There, a crash between
 *      the reservation CAS and the ledger `$inc` still leaves the two
 *      disagreeing.
 *   2. **Pre-existing data.** Any reservation written before this change, or
 *      any divergence that predates the repository.
 *   3. **Manual intervention.** A direct `db.scholarship_budget_ledgers.update`
 *      from an operator, or a migration that forgot to keep the tally in step.
 *
 * The invariant it enforces is deliberately a *derived* one, computed from the
 * reservations themselves rather than from anything the ledger remembers:
 *
 * ```
 *   ledger.reservedAmount   === Σ amount(reservations where status = PENDING)
 *   ledger.disbursedAmount  === Σ amount(reservations where status = CONFIRMED)
 * ```
 *
 * Deriving from the reservations is the point. The reservations are the record
 * of what was actually promised to applicants; the ledger's two tallies are a
 * cache of that. So the reconciliation repairs the cache and never the record —
 * there is no judgement call about which side is right, and no possibility of
 * "fixing" a reservation that a real applicant accepted.
 *
 * A ledger whose `totalBudget` is below the recomputed `reservedAmount +
 * disbursedAmount` is reported but **not** repaired: that means the program was
 * over-committed, which is a business decision (which award to unwind), not
 * something an unattended job may choose.
 *
 * Operational impact: hourly, plus an immediate pass at bootstrap. Each drifted
 * ledger emits `scholarship-finance.ledger.drift-detected` through the outbox so
 * the existing drift alert fires. A repair that finds nothing logs nothing.
 */
@Injectable()
export class BudgetLedgerReconciler {
  private readonly logger = new Logger(BudgetLedgerReconciler.name);

  constructor(
    @InjectModel(BudgetLedger.name)
    private readonly ledgerModel: Model<BudgetLedgerDocument>,
    @InjectModel(BudgetReservation.name)
    private readonly reservationModel: Model<BudgetReservationDocument>,
    private readonly transactions: ScholarshipTransactionRunner,
    private readonly outbox: OutboxService,
  ) {}

  /** Safety-net sweep alongside the hourly expiry. */
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'scholarship-budget-ledger-reconciliation',
  })
  async reconcileAll(): Promise<LedgerDrift[]> {
    const ledgers = await this.ledgerModel
      .find({})
      .sort({ updatedAt: 1 })
      .limit(LEDGER_SCAN_LIMIT)
      .exec();

    const drifts: LedgerDrift[] = [];
    for (const ledger of ledgers) {
      try {
        const drift = await this.reconcileOne(ledger);
        if (drift) drifts.push(drift);
      } catch (error) {
        // One bad ledger must not stop the sweep.
        this.logger.error(
          `Budget ledger reconciliation failed for ${ledger._id.toString()}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (drifts.length > 0) {
      this.logger.warn(
        `Budget ledger drift detected and repaired on ${drifts.length} ledger(s). ` +
          `If this recurs, the deployment is not running a replica set — see ` +
          `docs/scholarships/atomic-award-outbox.md.`,
      );
    }
    return drifts;
  }

  /**
   * Recomputes one ledger's tallies and repairs them if they differ.
   *
   * @returns the drift it repaired, or `null` when the ledger was already
   *   consistent or when the drift is not safely repairable.
   */
  async reconcileOne(
    ledger: BudgetLedgerDocument,
  ): Promise<LedgerDrift | null> {
    const expected = await this.recompute(ledger);
    if (!expected) return null;

    if (
      ledger.reservedAmount === expected.reservedAmount &&
      ledger.disbursedAmount === expected.disbursedAmount
    ) {
      return null;
    }

    const drift: LedgerDrift = {
      ledgerId: ledger._id.toString(),
      organizationId: ledger.organizationId,
      programId: ledger.programId.toString(),
      reservedAmount: ledger.reservedAmount,
      expectedReservedAmount: expected.reservedAmount,
      disbursedAmount: ledger.disbursedAmount,
      expectedDisbursedAmount: expected.disbursedAmount,
    };

    const committed = expected.reservedAmount + expected.disbursedAmount;
    if (committed > ledger.totalBudget) {
      // Real awards were promised beyond the program's budget. Only a human may
      // decide which of them to unwind, so surface it loudly and change nothing.
      this.logger.error(
        `Budget ledger ${drift.ledgerId} is over-committed: promised ${committed} ` +
          `${ledger.currency} against a total budget of ${ledger.totalBudget}. ` +
          `Tallies left unchanged — a program owner must unwind an award or raise ` +
          `the budget. Reservations: ${expected.pendingCount} pending, ` +
          `${expected.confirmedCount} confirmed.`,
      );
      await this.reportDrift(drift, null);
      return null;
    }

    await this.repair(ledger, drift, expected);
    return drift;
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async recompute(ledger: BudgetLedgerDocument): Promise<{
    reservedAmount: number;
    disbursedAmount: number;
    pendingCount: number;
    confirmedCount: number;
  } | null> {
    const rows = await this.reservationModel
      .aggregate<{ _id: ReservationStatus; total: number; count: number }>([
        {
          $match: {
            organizationId: ledger.organizationId,
            programId: ledger.programId,
          },
        },
        {
          $group: {
            _id: '$status',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    // No rows is a real answer, not an absent one: "no reservations at all" means
    // the ledger must be zero. Returning null here (as an earlier revision did)
    // skipped exactly the drift that matters most in practice — every reservation
    // released or expired, leaving a ledger still holding the old totals, which
    // then reports the program as permanently over-committed and blocks new
    // awards.
    const byStatus = new Map(rows.map((r) => [r._id, r]));
    const pending = byStatus.get(ReservationStatus.PENDING);
    const confirmed = byStatus.get(ReservationStatus.CONFIRMED);

    return {
      reservedAmount: pending?.total ?? 0,
      disbursedAmount: confirmed?.total ?? 0,
      pendingCount: pending?.count ?? 0,
      confirmedCount: confirmed?.count ?? 0,
    };
  }

  private async repair(
    ledger: BudgetLedgerDocument,
    drift: LedgerDrift,
    expected: { reservedAmount: number; disbursedAmount: number },
  ): Promise<void> {
    await this.transactions.run(
      'scholarships.reconcileBudgetLedger',
      async (session: ClientSession | null) => {
        // Conditional on the tallies still being the ones we diagnosed, so a
        // concurrent legitimate movement wins and we do not clobber it.
        const result = await withSession(
          this.ledgerModel.updateOne(
            {
              _id: ledger._id,
              reservedAmount: drift.reservedAmount,
              disbursedAmount: drift.disbursedAmount,
            },
            {
              $set: {
                reservedAmount: expected.reservedAmount,
                disbursedAmount: expected.disbursedAmount,
              },
            },
          ),
          session,
        ).exec();

        if (result.matchedCount === 0) {
          this.logger.log(
            `Budget ledger ${drift.ledgerId} moved while being reconciled; ` +
              `leaving it to the next pass.`,
          );
          return;
        }

        await this.outbox.stage(
          {
            organizationId: ledger.organizationId,
            aggregateType: OutboxAggregateType.BUDGET_LEDGER,
            aggregateId: drift.ledgerId,
            eventName: DomainEvents.SCHOLARSHIP_LEDGER_DRIFT_DETECTED,
            payload: {
              organizationId: ledger.organizationId,
              programId: drift.programId,
              ledgerId: drift.ledgerId,
              reservedAmount: drift.reservedAmount,
              disbursedAmount: drift.disbursedAmount,
              expectedReservedAmount: expected.reservedAmount,
              expectedDisbursedAmount: expected.disbursedAmount,
            },
          },
          session,
        );
      },
    );

    this.logger.warn(
      `Budget ledger ${drift.ledgerId} repaired: reservedAmount ` +
        `${drift.reservedAmount} → ${expected.reservedAmount}, disbursedAmount ` +
        `${drift.disbursedAmount} → ${expected.disbursedAmount}.`,
    );
  }

  /**
   * Reports drift without repairing it — used for the over-committed case, where
   * the tallies are correct but the budget is not.
   */
  private async reportDrift(
    drift: LedgerDrift,
    session: ClientSession | null,
  ): Promise<void> {
    await this.outbox.stage(
      {
        organizationId: drift.organizationId,
        aggregateType: OutboxAggregateType.BUDGET_LEDGER,
        aggregateId: drift.ledgerId,
        eventName: DomainEvents.SCHOLARSHIP_LEDGER_DRIFT_DETECTED,
        payload: {
          organizationId: drift.organizationId,
          programId: drift.programId,
          ledgerId: drift.ledgerId,
          reservedAmount: drift.reservedAmount,
          disbursedAmount: drift.disbursedAmount,
          expectedReservedAmount: drift.expectedReservedAmount,
          expectedDisbursedAmount: drift.expectedDisbursedAmount,
        },
      },
      session,
    );
  }

  /**
   * Exposed for the readiness endpoint and for tests: throws when a ledger
   * disagrees with its reservations. Never repairs, so it is safe to call from a
   * health check.
   */
  async assertConsistent(ledger: BudgetLedgerDocument): Promise<void> {
    const expected = await this.recompute(ledger);
    if (!expected) return;
    if (
      ledger.reservedAmount !== expected.reservedAmount ||
      ledger.disbursedAmount !== expected.disbursedAmount
    ) {
      throw new BusinessRuleException(
        `Budget ledger ${ledger._id.toString()} disagrees with its reservations.`,
        ErrorCode.BIZ_BUDGET_LEDGER_DRIFT,
      );
    }
  }
}
