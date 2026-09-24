import {
  Injectable,
  Logger,
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
