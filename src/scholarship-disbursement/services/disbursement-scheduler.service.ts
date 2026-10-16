import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { systemAuditContext } from '../../common/audit/audit-context';
import { DisbursementRunTrigger } from '../schemas/disbursement-run.schema';
import { DisbursementExecutorService } from './disbursement-executor.service';
import { DisbursementReconcilerService } from './disbursement-reconciler.service';

/**
 * In-process automation. Disabled unless SCHOLARSHIP_DISBURSEMENT_CRON_ENABLED
 * is true; both jobs take a cluster-wide lock, so enabling cron on several
 * replicas is safe (only one runs each tick).
 */
@Injectable()
export class DisbursementSchedulerService {
  private readonly logger = new Logger(DisbursementSchedulerService.name);

  constructor(
    private readonly executor: DisbursementExecutorService,
    private readonly reconciler: DisbursementReconcilerService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.config.get<boolean>('scholarships.cronEnabled') !== true) return;

    const actor = systemAuditContext('scholarship-cron', 'scholarship-cron');
    try {
      // Reconcile first so freshly settled failures are visible before new sends.
      const reconciled = await this.reconciler.run({
        trigger: DisbursementRunTrigger.CRON,
        actor,
      });
      const executed = await this.executor.run({
        trigger: DisbursementRunTrigger.CRON,
        actor,
      });
      if (executed.results.length || reconciled.results.length) {
        this.logger.log(
          `Scholarship cron: execute=${JSON.stringify(executed.summary)} reconcile=${JSON.stringify(reconciled.summary)}`,
        );
      }
      if (executed.haltReason && executed.started) {
        this.logger.warn(`Execution halted: ${executed.haltReason}`);
      }
    } catch (err) {
      this.logger.error(
        `Scholarship cron failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
