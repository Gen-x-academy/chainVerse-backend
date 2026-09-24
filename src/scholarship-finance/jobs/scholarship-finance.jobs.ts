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
}
