import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import {
  ErrorCode,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors';
import { fromMinorUnits, toMinorUnits } from '../common/money';
import { HorizonClient } from '../integrations/horizon.client';
import {
  LedgerQueryService,
  LedgerSnapshot,
} from '../ledger/ledger-query.service';
import {
  PayoutIntent,
  PayoutIntentDocument,
} from '../payouts/payout-intent.schema';
import { ScholarshipProgramDocument } from '../programs/scholarship-program.schema';
import { ScholarshipFinanceEvents } from '../scholarship-finance.events';
import { ReconciliationAlertsService } from './reconciliation-alerts.service';
import {
  Discrepancy,
  ReconciliationInputs,
  ReconciliationResults,
  ReconciliationRun,
  ReconciliationRunDocument,
  ReconciliationTrigger,
} from './reconciliation.schemas';

export interface RunReconciliationOptions {
  trigger: ReconciliationTrigger;
  triggeredBy: string;
  /** Required for programs whose externalBalanceSource is `manual`. */
  externalBalance?: string;
  externalObservedAt?: Date;
}

/**
 * Pure comparison of the derived ledger with the external (on-chain) balance.
 * Given identical inputs it always yields identical results.
 */
export function computeReconciliation(
  snapshot: LedgerSnapshot,
  external: bigint,
  inFlight: bigint,
): { results: ReconciliationResults; discrepancies: Discrepancy[] } {
  const { treasury, program_fund, reserved, awards_payable } =
    snapshot.balances;
  const liabilities = reserved + awards_payable;

  // Payouts whose outcome is not yet reported may already have left the
  // treasury without a disbursement entry. A shortfall up to that amount is
  // expected; anything beyond it (or any surplus) is unexplained drift.
  const drift = external - treasury;
  const explainedDrift =
    drift < 0n ? (-drift <= inFlight ? drift : -inFlight) : 0n;
  const unexplainedDrift = drift - explainedDrift;
  const solvencyMargin = external - explainedDrift - liabilities;

  const discrepancies: Discrepancy[] = [];
  const fmt = fromMinorUnits;

  if (
    snapshot.unbalancedEntryIds.length ||
    snapshot.trialBalanceDifference !== 0n
  ) {
    discrepancies.push({
      type: 'ledger_integrity',
      severity: 'critical',
      message: 'Ledger does not balance; entries or totals are inconsistent.',
      details: {
        unbalancedEntryIds: snapshot.unbalancedEntryIds,
        trialBalanceDifference: fmt(snapshot.trialBalanceDifference),
      },
    });
  }
  const negative = Object.entries(snapshot.balances).filter(([, v]) => v < 0n);
  if (negative.length) {
    discrepancies.push({
      type: 'negative_balance',
      severity: 'critical',
      message: `Negative account balance: ${negative.map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}`,
      details: Object.fromEntries(negative.map(([k, v]) => [k, fmt(v)])),
    });
  }
  if (unexplainedDrift !== 0n) {
    discrepancies.push({
      type: 'balance_drift',
      severity: 'critical',
      message: `On-chain treasury differs from the ledger by ${fmt(unexplainedDrift)} (not explained by in-flight payouts).`,
      details: {
        external: fmt(external),
        ledgerTreasury: fmt(treasury),
        inFlight: fmt(inFlight),
        unexplainedDrift: fmt(unexplainedDrift),
      },
    });
  }
  if (solvencyMargin < 0n) {
    discrepancies.push({
      type: 'insolvency',
      severity: 'critical',
      message: `Obligations exceed available funds by ${fmt(-solvencyMargin)}.`,
      details: {
        external: fmt(external),
        reserved: fmt(reserved),
        awardsPayable: fmt(awards_payable),
        solvencyMargin: fmt(solvencyMargin),
      },
    });
  }

  return {
    results: {
      ledgerTreasury: treasury.toString(),
      programFund: program_fund.toString(),
      reserved: reserved.toString(),
      awardsPayable: awards_payable.toString(),
      liabilities: liabilities.toString(),
      drift: drift.toString(),
      explainedDrift: explainedDrift.toString(),
      unexplainedDrift: unexplainedDrift.toString(),
      solvencyMargin: solvencyMargin.toString(),
      trialBalanceDifference: snapshot.trialBalanceDifference.toString(),
      unbalancedEntryIds: snapshot.unbalancedEntryIds,
    },
    discrepancies,
  };
}

const MINOR_RESULT_FIELDS: (keyof ReconciliationResults)[] = [
  'ledgerTreasury',
  'programFund',
  'reserved',
  'awardsPayable',
  'liabilities',
  'drift',
  'explainedDrift',
  'unexplainedDrift',
  'solvencyMargin',
  'trialBalanceDifference',
];

export function presentRun(run: ReconciliationRun & { _id?: unknown }) {
  const results: Record<string, unknown> = { ...run.results };
  for (const f of MINOR_RESULT_FIELDS)
    results[f] = fromMinorUnits(BigInt(run.results[f] as string));
  return {
    id: String(run._id),
    organizationId: run.organizationId,
    programId: run.programId,
    trigger: run.trigger,
    triggeredBy: run.triggeredBy,
    assetCode: run.assetCode,
    status: run.status,
    inputs: {
      ...run.inputs,
      externalBalance: fromMinorUnits(BigInt(run.inputs.externalBalance)),
      inFlightPayouts: fromMinorUnits(BigInt(run.inputs.inFlightPayouts)),
    },
    results,
    discrepancies: run.discrepancies,
    alertIds: run.alertIds,
    createdAt: run.createdAt,
  };
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectModel(ReconciliationRun.name)
    private readonly runModel: Model<ReconciliationRunDocument>,
    @InjectModel(PayoutIntent.name)
    private readonly payoutModel: Model<PayoutIntentDocument>,
    private readonly ledgerQuery: LedgerQueryService,
    private readonly alerts: ReconciliationAlertsService,
    private readonly horizon: HorizonClient,
    private readonly events: EventEmitter2,
  ) {}

  async run(
    program: ScholarshipProgramDocument,
    opts: RunReconciliationOptions,
  ) {
    const programId = String(program._id);
    const asOf = new Date();

    const external = await this.externalBalance(program, opts);
    const [snapshot, inFlight] = await Promise.all([
      this.ledgerQuery.snapshot(programId, asOf, asOf),
      this.inFlight(programId),
    ]);
    const { results, discrepancies } = computeReconciliation(
      snapshot,
      external.amount,
      inFlight.amount,
    );

    const inputs: ReconciliationInputs = {
      asOf,
      ledgerEntryCount: snapshot.entryCount,
      lastEntryId: snapshot.lastEntryId,
      externalBalance: external.amount.toString(),
      externalBalanceSource: external.source,
      externalObservedAt: external.observedAt,
      inFlightPayouts: inFlight.amount.toString(),
      inFlightPayoutCount: inFlight.count,
    };

    // Alerts are raised first against a pre-allocated id so that the run
    // document is written exactly once and never updated.
    const runId = new Types.ObjectId();
    const alertIds: string[] = [];
    for (const d of discrepancies) {
      const alert = await this.alerts.raise(
        program.organizationId,
        programId,
        d,
        String(runId),
      );
      alertIds.push(alert.id);
    }

    const run = await this.runModel.create({
      _id: runId,
      organizationId: program.organizationId,
      programId,
      trigger: opts.trigger,
      triggeredBy: opts.triggeredBy,
      assetCode: program.asset.code,
      inputs,
      results,
      status: discrepancies.length ? 'discrepancies' : 'balanced',
      discrepancies,
      alertIds,
    });

    this.logger.log(
      `Reconciliation ${run.id} for program ${programId}: ${run.status} (${discrepancies.length} discrepancies)`,
    );
    this.events.emit(ScholarshipFinanceEvents.RECONCILIATION_COMPLETED, {
      organizationId: program.organizationId,
      programId,
      runId: run.id,
      status: run.status,
    });
    return run.toObject();
  }

  /**
   * Recomputes a past run from its recorded inputs and reports whether the
   * outcome is identical. Nothing is persisted.
   */
  async replay(program: ScholarshipProgramDocument, runId: string) {
    const original = await this.get(program, runId);
    const snapshot = await this.ledgerQuery.snapshot(
      original.programId,
      original.inputs.asOf,
      original.inputs.asOf,
    );
    const recomputed = computeReconciliation(
      snapshot,
      BigInt(original.inputs.externalBalance),
      BigInt(original.inputs.inFlightPayouts),
    );
    const mismatches: string[] = MINOR_RESULT_FIELDS.filter(
      (f) => recomputed.results[f] !== original.results[f],
    );
    if (snapshot.entryCount !== original.inputs.ledgerEntryCount)
      mismatches.push('ledgerEntryCount');
    return {
      runId: String(original._id),
      matches: mismatches.length === 0,
      mismatchedFields: mismatches,
      recomputedStatus: recomputed.discrepancies.length
        ? 'discrepancies'
        : 'balanced',
      originalStatus: original.status,
    };
  }

  latest(programId: string) {
    return this.runModel
      .findOne({ programId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  list(program: ScholarshipProgramDocument, limit = 50) {
    return this.runModel
      .find({ programId: String(program._id) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async get(program: ScholarshipProgramDocument, runId: string) {
    const run = isValidObjectId(runId)
      ? await this.runModel
          .findOne({ _id: runId, programId: String(program._id) })
          .lean()
          .exec()
      : null;
    if (!run) {
      throw new ResourceNotFoundException(
        'Reconciliation run not found',
        ErrorCode.RES_RECONCILIATION_NOT_FOUND,
      );
    }
    return run;
  }

  /** Sum of payouts submitted to the network whose outcome is not yet known. */
  async inFlight(programId: string) {
    const intents = await this.payoutModel
      .find({ programId, status: 'submitted' }, { amount: 1 })
      .lean()
      .exec();
    return {
      amount: intents.reduce((acc, i) => acc + BigInt(i.amount), 0n),
      count: intents.length,
    };
  }

  private async externalBalance(
    program: ScholarshipProgramDocument,
    opts: RunReconciliationOptions,
  ) {
    if (opts.externalBalance !== undefined) {
      return {
        amount: toMinorUnits(opts.externalBalance),
        source: 'manual' as const,
        observedAt: opts.externalObservedAt ?? new Date(),
      };
    }
    if (program.externalBalanceSource === 'manual') {
      throw new ValidationDomainException(
        'This program reconciles against a manual balance snapshot; provide externalBalance',
      );
    }
    const balance = await this.horizon.getAccountBalance(
      program.network,
      program.treasuryAccount,
      program.asset,
    );
    return {
      amount: toMinorUnits(balance),
      source: 'horizon' as const,
      observedAt: new Date(),
    };
  }
}
