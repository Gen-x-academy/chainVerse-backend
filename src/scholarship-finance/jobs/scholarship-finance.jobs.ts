import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/app.config';
import { PayoutsService } from '../payouts/payouts.service';
import { ScholarshipProgramService } from '../programs/scholarship-program.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';

/**
 * In-process schedulers for the scholarship finance domain.
 *
 * - Reconciliation: reconciles every active Horizon-backed program on an
 *   interval (SCHOLARSHIP_RECONCILIATION_INTERVAL_MS, 0 disables).
 * - Payout recovery: expires stale attempts and creates automatic retries
 *   (SCHOLARSHIP_PAYOUT_RETRY_INTERVAL_MS, 0 disables).
 *
 * Every step is idempotent, so running more than one replica is safe; it
 * only wastes a little work. Ticks never overlap within a process.
 */
@Injectable()
export class ScholarshipFinanceJobs
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ScholarshipFinanceJobs.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly running = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly programs: ScholarshipProgramService,
    private readonly reconciliation: ReconciliationService,
    private readonly payouts: PayoutsService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const cfg =
      this.config.get<AppConfig['scholarshipFinance']>('scholarshipFinance');
    this.schedule(
      'reconciliation',
      cfg?.reconciliationIntervalMs ?? 3_600_000,
      () => this.reconcileAll(),
    );
    this.schedule('payout-recovery', cfg?.payoutRetryIntervalMs ?? 60_000, () =>
      this.recoverPayouts(),
    );
  }

  onApplicationShutdown() {
    this.timers.forEach(clearInterval);
  }

  async reconcileAll() {
    const programs = await this.programs.findActive();
    for (const program of programs) {
      if (program.externalBalanceSource !== 'horizon') continue;
      try {
        await this.reconciliation.run(program, {
          trigger: 'scheduled',
          triggeredBy: 'system:reconciliation-job',
        });
      } catch (err) {
        this.logger.error(
          `Scheduled reconciliation failed for program ${program.id}: ${String(err)}`,
        );
      }
    }
  }

  async recoverPayouts() {
    const expired = await this.payouts.sweepExpiredAttempts();
    const retried = await this.payouts.runAutoRetries();
    if (expired || retried) {
      this.logger.log(
        `Payout recovery: ${expired} expired attempts checked, ${retried} retries due`,
      );
    }
  }

  private schedule(
    name: string,
    intervalMs: number,
    task: () => Promise<void>,
  ) {
    if (!intervalMs) {
      this.logger.log(`Job "${name}" disabled`);
      return;
    }
    const timer = setInterval(() => {
      if (this.running.has(name)) return;
      this.running.add(name);
      task()
        .catch((err) =>
          this.logger.error(`Job "${name}" failed: ${String(err)}`),
        )
        .finally(() => this.running.delete(name));
    }, intervalMs);
    timer.unref();
    this.timers.push(timer);
  }
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvents } from '../../events/event-names';
import { FundingService } from '../services/funding.service';
import { BalanceDrift, LedgerService } from '../services/ledger.service';
import {
  RecoveryReconciliation,
  RecoveryService,
} from '../services/recovery.service';

export interface JobRunResult {
  startedAt: Date;
  roundsClosed: number;
  ledgerDrift: BalanceDrift[];
  unbalancedRecoveries: RecoveryReconciliation[];
}

/**
 * Periodic maintenance for scholarship finance. Disabled by default; enable
 * on exactly one instance with SCHOLARSHIP_FINANCE_JOBS_ENABLED=true (all
 * jobs are idempotent, so accidental overlap is safe but wasteful).
 *
 * 1. Close funding rounds whose window has ended.
 * 2. Recompute ledger balances from journals and flag drift.
 * 3. Reconcile recovery claims against collections and the ledger.
 *
 * Jobs only detect and report — they never post corrective entries.
 */
@Injectable()
export class ScholarshipFinanceJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScholarshipFinanceJobs.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly funding: FundingService,
    private readonly ledger: LedgerService,
    private readonly recoveries: RecoveryService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit() {
    const enabled =
      String(this.config.get('SCHOLARSHIP_FINANCE_JOBS_ENABLED') ?? 'false') ===
      'true';
    if (!enabled) return;
    const interval = Number(
      this.config.get('SCHOLARSHIP_FINANCE_JOB_INTERVAL_MS') ?? 900_000,
    );
    this.timer = setInterval(
      () => void this.runAll().catch(() => undefined),
      interval,
    );
    this.timer.unref();
    this.logger.log(`Scholarship finance jobs scheduled every ${interval}ms`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runAll(): Promise<JobRunResult | null> {
    if (this.running) return null;
    this.running = true;
    const startedAt = new Date();
    try {
      const roundsClosed = await this.funding.closeExpiredRounds(startedAt);

      const ledgerDrift = await this.ledger.findDrift();
      if (ledgerDrift.length) {
        this.logger.error(
          `Ledger drift detected on ${ledgerDrift.length} account(s)`,
        );
        this.events.emit(DomainEvents.SCHOLARSHIP_LEDGER_DRIFT_DETECTED, {
          kind: 'ledger',
          ledgerDrift,
        });
      }

      const unbalancedRecoveries: RecoveryReconciliation[] = [];
      for (const organizationId of await this.recoveries.organizationsWithClaims()) {
        const result = await this.recoveries.reconcile(organizationId);
        if (!result.balanced) unbalancedRecoveries.push(result);
      }
      if (unbalancedRecoveries.length) {
        this.logger.error(
          `Recovery reconciliation failed for ${unbalancedRecoveries.length} organization(s)`,
        );
        this.events.emit(DomainEvents.SCHOLARSHIP_LEDGER_DRIFT_DETECTED, {
          kind: 'recovery',
          unbalancedRecoveries,
        });
      }

      return { startedAt, roundsClosed, ledgerDrift, unbalancedRecoveries };
    } catch (err) {
      this.logger.error(
        'Scholarship finance job run failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    } finally {
      this.running = false;
    }
  }
}
